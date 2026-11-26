import "server-only";
import type Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";
import type { PaymentDoc } from "@/lib/firestore/types";
import { DAY_MS, computeExpiry, isLifetime } from "@/lib/shared/billing-access";
import { grantedMsOf } from "./adjust";
import { isSessionSettled } from "./stripe";

/**
 * Back-fill REPORTS (S2-06). Everything here is read-only: it only ever calls `.get()`, `.getAll()` and
 * Stripe `list`. Nothing in this file can change user data; the apply step is a separate script (S2-08)
 * that runs only on rows the owner approved.
 */

export const REPORT_WINDOW_MS = 13 * 30 * DAY_MS; // "last 13 months" for Report B
const FLAG_THRESHOLD_MS = DAY_MS;

// ---------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------

/** One CSV cell. Quotes when needed, and defuses spreadsheet formulas (a cell starting with = + - @ is data, not code). */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "string" ? value : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: (keyof T & string)[]): string {
  const lines = [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))];
  return lines.join("\n") + "\n";
}

const iso = (ms: number) => (ms > 0 ? new Date(ms).toISOString() : "");
const days = (ms: number) => Math.round((ms / DAY_MS) * 10) / 10;

// ---------------------------------------------------------------------------------------------
// Report A: replay each user's payments with the new stacking rule
// ---------------------------------------------------------------------------------------------

/** Payments whose grant was taken back (refund, dispute) must not count towards the expected expiry. */
const grantTakenBack = (p: Pick<PaymentDoc, "status">) =>
  p.status === "refunded" || p.status === "disputed" || p.status === "dispute_lost";

/**
 * Expected expiry if every counted payment had been fulfilled with `computeExpiry` at the moment it
 * was recorded (`activatedAt`), oldest first.
 */
export function replayPayments(payments: Pick<PaymentDoc, "activatedAt" | "grantedMs" | "accessDays" | "interval" | "status">[]): {
  expiresAt: number;
  counted: number;
} {
  let expiresAt = 0;
  let counted = 0;
  for (const p of [...payments].sort((a, b) => a.activatedAt - b.activatedAt)) {
    if (grantTakenBack(p)) continue;
    expiresAt = computeExpiry({ now: p.activatedAt, currentExpiresAt: expiresAt, grantedMs: grantedMsOf(p as PaymentDoc).ms });
    counted++;
  }
  return { expiresAt, counted };
}

export type ReportARow = {
  uid: string;
  email: string;
  paymentsReplayed: number;
  expectedExpiry: string;
  currentExpiry: string;
  deltaDays: number;
  plan: string;
  /** under_extended: the customer should have more time (e.g. PAY-2). over_extended: they have more than payments explain (never reduced automatically). */
  category: "under_extended" | "over_extended";
  /** Both dates already passed: no effect on access today. */
  bothExpired: boolean;
  note: string;
};

export type ReportASummary = {
  usersWithPayments: number;
  matched: number;
  underExtended: number;
  overExtended: number;
  skippedComp: number;
  skippedAdmin: number;
  orphanPayments: number; // payments whose user document no longer exists
};

export const REPORT_A_COLUMNS: (keyof ReportARow)[] = [
  "uid", "email", "paymentsReplayed", "expectedExpiry", "currentExpiry", "deltaDays", "plan", "category", "bothExpired", "note",
];

export async function buildReportA(
  db: Firestore,
  { now = Date.now(), adminUid = process.env.ADMIN_UID }: { now?: number; adminUid?: string } = {},
): Promise<{ rows: ReportARow[]; summary: ReportASummary }> {
  const byUser = new Map<string, PaymentDoc[]>();
  for (const doc of (await db.collection("payments").get()).docs) {
    const p = doc.data() as PaymentDoc;
    if (!p.uid) continue;
    byUser.set(p.uid, [...(byUser.get(p.uid) ?? []), p]);
  }

  const summary: ReportASummary = {
    usersWithPayments: byUser.size, matched: 0, underExtended: 0, overExtended: 0, skippedComp: 0, skippedAdmin: 0, orphanPayments: 0,
  };
  const rows: ReportARow[] = [];
  const uids = [...byUser.keys()];

  for (let i = 0; i < uids.length; i += 100) {
    const chunk = uids.slice(i, i + 100);
    const snaps = await db.getAll(...chunk.map((uid) => db.collection("users").doc(uid)));
    snaps.forEach((snap, idx) => {
      const uid = chunk[idx];
      const payments = byUser.get(uid)!;
      if (!snap.exists) {
        summary.orphanPayments += payments.length;
        return;
      }
      const user = snap.data()!;
      const current = typeof user.subscriptionExpiresAt === "number" ? user.subscriptionExpiresAt : 0;

      if (adminUid && uid === adminUid) return void summary.skippedAdmin++;
      // Admin grants (comp / lifetime) add time that payments alone cannot explain.
      if (user.compGranted === true || isLifetime(current)) return void summary.skippedComp++;

      const { expiresAt: expected, counted } = replayPayments(payments);
      const delta = expected - current;
      if (Math.abs(delta) <= FLAG_THRESHOLD_MS) return void summary.matched++;

      const under = delta > 0;
      if (under) summary.underExtended++;
      else summary.overExtended++;
      rows.push({
        uid,
        email: String(user.email ?? ""),
        paymentsReplayed: counted,
        expectedExpiry: iso(expected),
        currentExpiry: iso(current),
        deltaDays: days(delta),
        plan: String(user.planName ?? ""),
        category: under ? "under_extended" : "over_extended",
        bothExpired: expected <= now && current <= now,
        note: under
          ? "Payments add up to more time than the account has"
          : "Account has more time than its payments explain: review only, never reduced automatically",
      });
    });
  }

  // Most urgent first: customers who should have access today but do not, then everyone else who is
  // affected today, then accounts where both dates have passed (no effect on access); biggest gap first.
  const rank = (r: ReportARow) =>
    r.category === "under_extended" && Date.parse(r.expectedExpiry) > now && (Date.parse(r.currentExpiry || "") || 0) <= now
      ? 0
      : r.bothExpired
        ? 2
        : 1;
  rows.sort((a, b) => rank(a) - rank(b) || Math.abs(b.deltaDays) - Math.abs(a.deltaDays));
  return { rows, summary };
}

// ---------------------------------------------------------------------------------------------
// Report B: paid Stripe sessions with no payments document
// ---------------------------------------------------------------------------------------------

export type ReportBRow = {
  sessionId: string;
  created: string;
  uid: string;
  email: string;
  amount: number;
  currency: string;
  paymentIntent: string;
  planId: string;
  interval: string;
  livemode: boolean;
  note: string;
};

export const REPORT_B_COLUMNS: (keyof ReportBRow)[] = [
  "sessionId", "created", "uid", "email", "amount", "currency", "paymentIntent", "planId", "interval", "livemode", "note",
];

export type ReportBSummary = { sessionsSeen: number; paidSessions: number; missing: number; skippedForeign: number };

const MAX_PAGES = 200; // 20,000 sessions

export async function buildReportB(
  db: Firestore,
  stripe: Pick<Stripe, "checkout">,
  { now = Date.now(), windowMs = REPORT_WINDOW_MS }: { now?: number; windowMs?: number } = {},
): Promise<{ rows: ReportBRow[]; summary: ReportBSummary }> {
  const since = Math.floor((now - windowMs) / 1000);
  const summary: ReportBSummary = { sessionsSeen: 0, paidSessions: 0, missing: 0, skippedForeign: 0 };
  const paid: Stripe.Checkout.Session[] = [];

  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await stripe.checkout.sessions.list({ created: { gte: since }, limit: 100, ...(after ? { starting_after: after } : {}) });
    for (const s of res.data) {
      summary.sessionsSeen++;
      if (s.status !== "complete" || !isSessionSettled(s)) continue;
      // Sessions created by other products on the same Stripe account carry none of our markers.
      if (!s.metadata?.uid && !s.client_reference_id) {
        summary.skippedForeign++;
        continue;
      }
      paid.push(s);
    }
    if (!res.has_more || res.data.length === 0) break;
    after = res.data[res.data.length - 1].id;
  }
  summary.paidSessions = paid.length;

  const rows: ReportBRow[] = [];
  for (let i = 0; i < paid.length; i += 100) {
    const chunk = paid.slice(i, i + 100);
    const snaps = await db.getAll(...chunk.map((s) => db.collection("payments").doc(s.id)));
    snaps.forEach((snap, idx) => {
      if (snap.exists) return;
      const s = chunk[idx];
      rows.push({
        sessionId: s.id,
        created: new Date(s.created * 1000).toISOString(),
        uid: s.metadata?.uid || s.client_reference_id || "",
        email: s.customer_details?.email ?? s.customer_email ?? "",
        amount: s.amount_total ?? 0,
        currency: (s.currency ?? "").toUpperCase(),
        paymentIntent: typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? ""),
        planId: s.metadata?.planId ?? "",
        interval: s.metadata?.interval ?? "",
        livemode: s.livemode,
        note: "Paid in Stripe but no payments document: customer may not have been extended",
      });
    });
  }
  summary.missing = rows.length;
  rows.sort((a, b) => a.created.localeCompare(b.created));
  return { rows, summary };
}
