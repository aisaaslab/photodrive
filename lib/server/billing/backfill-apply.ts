import type { Firestore } from "firebase-admin/firestore";
import type { PaymentDoc } from "@/lib/firestore/types";
import { DAY_MS, isLifetime } from "./access";
import { replayPayments } from "./backfill";

/**
 * Back-fill APPLY (S2-08). Writes only for rows the owner explicitly approved, and only ever RAISES an account's
 * expiry. Every row is re-checked against the data as it is NOW (the CSV is a proposal, not an instruction), the
 * change and its audit record are written in one transaction, and a re-run changes nothing.
 */

// ---------------------------------------------------------------------------------------------
// CSV reading
// ---------------------------------------------------------------------------------------------

/** RFC 4180 reader: quoted cells, doubled quotes, newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

/** The report writer defuses spreadsheet formulas by prefixing `'`; undo that when reading the cell back. */
const unescapeCell = (c: string) => (/^'[=+\-@\t\r]/.test(c) ? c.slice(1) : c).trim();

export type ApprovedRow = {
  uid: string;
  category: string;
  expectedExpiry: string;
  currentExpiry: string;
  approved: boolean;
};

const TRUE = new Set(["yes", "y", "true", "1", "x", "approved"]);

/**
 * Reads the owner's approved file: a copy of Report A with an `approved` column. A row counts as approved only if
 * that cell says yes (y, true, 1, x). A file without the columns `uid`, `expectedExpiry` and `approved` is refused.
 */
export function parseApprovedCsv(text: string): { rows: ApprovedRow[]; error?: string } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], error: "The approved file is empty" };
  const header = table[0].map((h) => unescapeCell(h));
  const col = (name: string) => header.indexOf(name);
  for (const required of ["uid", "expectedExpiry", "approved"]) {
    if (col(required) < 0) return { rows: [], error: `The approved file has no "${required}" column (use a copy of Report A and add an "approved" column)` };
  }
  const rows = table.slice(1).map((r) => {
    const get = (name: string) => (col(name) >= 0 ? unescapeCell(r[col(name)] ?? "") : "");
    return {
      uid: get("uid"),
      category: get("category"),
      expectedExpiry: get("expectedExpiry"),
      currentExpiry: get("currentExpiry"),
      approved: TRUE.has(get("approved").toLowerCase()),
    };
  });
  return { rows: rows.filter((r) => r.uid) };
}

// ---------------------------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------------------------

export type RowOutcome =
  | "applied"
  | "would_apply"
  | "skipped_not_approved"
  | "skipped_not_under_extended"
  | "skipped_bad_row"
  | "skipped_user_missing"
  | "skipped_comp_or_lifetime"
  | "skipped_changed_since_report"
  | "skipped_payments_changed_since_report"
  | "skipped_already_correct"
  | "skipped_would_lower"
  | "error";

export type ApplyResult = { uid: string; outcome: RowOutcome; detail?: string; before?: number; after?: number };

export const ACTOR = "script:backfill-s2-08";
const TOLERANCE_MS = 1000;
const FLAG_THRESHOLD_MS = DAY_MS;

const toMs = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

export async function applyBackfill(
  db: Firestore,
  rows: ApprovedRow[],
  {
    apply, now = Date.now(), runId, approvedBy, source,
  }: { apply: boolean; now?: number; runId: string; approvedBy: string; source: string },
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];

  for (const row of rows) {
    const done = (outcome: RowOutcome, extra: Partial<ApplyResult> = {}) => void results.push({ uid: row.uid, outcome, ...extra });

    if (!row.approved) { done("skipped_not_approved"); continue; }
    if (row.category !== "under_extended") {
      // over_extended rows are review-only: this script never reduces access, whatever the file says.
      done("skipped_not_under_extended", { detail: row.category || "no category" });
      continue;
    }
    const expectedInFile = toMs(row.expectedExpiry);
    const currentInFile = row.currentExpiry ? toMs(row.currentExpiry) : 0;
    if (expectedInFile === null || currentInFile === null) { done("skipped_bad_row", { detail: "unreadable date" }); continue; }

    try {
      const outcome = await db.runTransaction(async (tx): Promise<ApplyResult> => {
        const userRef = db.collection("users").doc(row.uid);
        const [userSnap, paymentsSnap] = await Promise.all([
          tx.get(userRef),
          tx.get(db.collection("payments").where("uid", "==", row.uid)),
        ]);
        if (!userSnap.exists) return { uid: row.uid, outcome: "skipped_user_missing" };
        const user = userSnap.data()!;
        const current = typeof user.subscriptionExpiresAt === "number" ? user.subscriptionExpiresAt : 0;

        if (user.compGranted === true || isLifetime(current)) return { uid: row.uid, outcome: "skipped_comp_or_lifetime" };
        // The account must still look the way it did when the report was made.
        if (Math.abs(current - currentInFile) > TOLERANCE_MS) {
          return { uid: row.uid, outcome: "skipped_changed_since_report", detail: "the account's expiry has changed since the report", before: current };
        }
        // Recompute from the payments as they are now; the file is not trusted.
        const { expiresAt: expected } = replayPayments(paymentsSnap.docs.map((d) => d.data() as PaymentDoc));
        if (Math.abs(expected - expectedInFile) > TOLERANCE_MS) {
          return { uid: row.uid, outcome: "skipped_payments_changed_since_report", detail: "the payments differ from the report", before: current, after: expected };
        }
        if (expected <= current) return { uid: row.uid, outcome: expected + FLAG_THRESHOLD_MS < current ? "skipped_would_lower" : "skipped_already_correct", before: current, after: expected };
        if (expected - current <= FLAG_THRESHOLD_MS) return { uid: row.uid, outcome: "skipped_already_correct", before: current, after: expected };

        if (!apply) return { uid: row.uid, outcome: "would_apply", before: current, after: expected };

        const status = expected > now ? "active" : (user.subscriptionStatus ?? "expired");
        tx.set(userRef, { subscriptionExpiresAt: expected, subscriptionStatus: status }, { merge: true });
        // Deterministic id: if this exact correction was already recorded, the create fails and nothing is applied twice.
        tx.create(db.collection("audit_log").doc(`backfill-${row.uid}-${expected}`), {
          at: now,
          actorUid: ACTOR,
          action: "backfill_extend_expiry",
          targetType: "user",
          targetId: row.uid,
          before: { subscriptionExpiresAt: current, subscriptionStatus: user.subscriptionStatus ?? null },
          after: { subscriptionExpiresAt: expected, subscriptionStatus: status },
          note: "Payments replayed with the stacking rule (S2-08); only ever raises access",
          approvedBy,
          runId,
          source,
        });
        return { uid: row.uid, outcome: "applied", before: current, after: expected };
      });
      results.push(outcome);
    } catch (err) {
      // ALREADY_EXISTS from tx.create: this correction was recorded before.
      const code = (err as { code?: number | string }).code;
      if (code === 6 || code === "already-exists") results.push({ uid: row.uid, outcome: "skipped_already_correct", detail: "already recorded in audit_log" });
      else results.push({ uid: row.uid, outcome: "error", detail: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------------------------
// Command-line guard rails (pure, so they are tested)
// ---------------------------------------------------------------------------------------------

export type CliArgs = { apply: boolean; approvedFile?: string; approvedBy?: string; confirmProject?: string };

/** Returns an error message when the combination of options is not allowed to run. */
export function checkCliGuards(a: CliArgs, projectId: string | undefined): string | null {
  if (!a.approvedFile) return "Refusing to run without --approved <file>: the file defines exactly what may change.";
  if (!a.apply) return null; // dry run: nothing is written
  if (!a.approvedBy?.trim()) return 'Refusing to apply without --approved-by "<name>": who approved these rows is recorded in the audit log.';
  if (!projectId) return "FIREBASE_ADMIN_PROJECT_ID is not set: cannot tell which project would be changed.";
  if (a.confirmProject !== projectId) return `Refusing to apply: pass --confirm-project ${projectId} to confirm this is the project you mean to change.`;
  return null;
}
