import "server-only";
import { AggregateField, Timestamp, type Firestore, type Query } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { listAllPlans } from "@/lib/plans";
import { galleriesCol, paymentsCol, systemStateDoc, usersCol } from "./collections";
import { toMs } from "@/lib/server/migrations/restore-created-at";

/**
 * The numbers on the admin overview (S7-04, SEC-5). The old endpoint read every user, gallery and payment on every page view and
 * listed up to 1,000 Auth accounts; that stops working long before a business is large. Now:
 *
 *  - totals come from Firestore aggregation queries (`count()` and `sum()`), which are computed by the database from its indexes and
 *    never load documents: ten thousand users cost about ten reads, not ten thousand;
 *  - only the users with active access are read (three fields each) to split them into monthly, yearly and comp;
 *  - the result is stored in ONE document (`system_state/stats-overview`) and the endpoint serves that document; it is recomputed when it
 *    is older than ten minutes and every night by `/api/cron/stats-recompute`, so a stale or lost document can never be wrong for long;
 *  - revenue is reported per currency, never summed across currencies (PAY-6).
 *
 * Deliberate difference from the first design ("incremental counters"): recomputing from the database is always correct, with no
 * counter to drift when a code path forgets to update it, and the cost is bounded by the cache.
 */
export const OVERVIEW_TTL_MS = 10 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
/** Far-future sentinel used for "lifetime / comp" access (Jan 1, 3000). */
const LIFETIME = 32503680000000;

export type OverviewPerson = { uid: string; email: string; displayName: string; photoURL: string | null };
export type Overview = {
  computedAt: number;
  stats: {
    totalUsers: number; newUsers7d: number; newUsers30d: number;
    activeSubscriptions: number; monthlySubscriptions: number; yearlySubscriptions: number; compSubscriptions: number;
    freeCodeSignups: number; totalGalleries: number; newGalleries30d: number;
    /** Major units per currency, e.g. { usd: 1234.5, eur: 99 }. */
    revenueByCurrency: Record<string, number>;
    /** Kept for the existing overview page: the USD figure. */
    revenueUsd: number;
    paymentCount: number; expiringSoonCount: number; planCount: number; publicPlanCount: number;
  };
  expiringSoon: (OverviewPerson & { expiresAt: number; daysLeft: number; planName: string | null })[];
  recentUsers: (OverviewPerson & { createdAt: number | null; subscriptionActive: boolean })[];
};

const countOf = async (q: { count(): { get(): Promise<{ data(): { count: number } }> } }) => (await q.count().get()).data().count;

/** Sign-up dates are stored as Firestore Timestamps (client writes) and, for restored profiles, sometimes as numbers; a range query only
 * matches its own type, so count both. Galleries store plain numbers. */
async function countSince(q: Query, field: string, sinceMs: number, types: ("timestamp" | "number")[] = ["timestamp", "number"]): Promise<number> {
  const parts = await Promise.all(types.map((t) => countOf(q.where(field, ">=", t === "timestamp" ? Timestamp.fromMillis(sinceMs) : sinceMs))));
  return parts.reduce((a, b) => a + b, 0);
}

async function people(uids: string[]): Promise<Map<string, OverviewPerson>> {
  const out = new Map<string, OverviewPerson>();
  if (uids.length === 0) return out;
  const found = await getAdminAuth().getUsers(uids.map((uid) => ({ uid })));
  for (const u of found.users) out.set(u.uid, { uid: u.uid, email: u.email ?? "", displayName: u.displayName ?? "", photoURL: u.photoURL ?? null });
  return out;
}

export async function computeOverview(db: Firestore = getAdminDb(), now = Date.now()): Promise<Overview> {
  const users = usersCol(db);
  const galleries = galleriesCol(db);
  const payments = paymentsCol(db);

  const [totalUsers, newUsers7d, newUsers30d, totalGalleries, newGalleries30d, freeCodeSignups, paidCount, plans] = await Promise.all([
    countOf(users),
    countSince(users, "createdAt", now - 7 * DAY),
    countSince(users, "createdAt", now - 30 * DAY),
    countOf(galleries),
    countSince(galleries, "createdAt", now - 30 * DAY, ["number"]),
    countOf(payments.where("amountTotal", "==", 0)), // $0 checkouts are free-code sign-ups, not payments
    countOf(payments.where("amountTotal", ">", 0)),
    listAllPlans(),
  ]);

  // Users whose access has not run out, three or four fields each. Same rule as before: status "active" and not expired.
  const candidates = await users.where("subscriptionExpiresAt", ">", now).select("subscriptionStatus", "planInterval", "compGranted", "planName", "name", "subscriptionExpiresAt").get();
  const active = candidates.docs.filter((d) => d.get("subscriptionStatus") === "active");
  let monthly = 0, yearly = 0, comp = 0;
  for (const d of active) {
    if (d.get("compGranted") === true) comp += 1;
    const interval = d.get("planInterval");
    if (interval === "monthly") monthly += 1;
    else if (interval === "yearly") yearly += 1;
  }
  const expiring = active
    .map((d) => ({ id: d.id, at: d.get("subscriptionExpiresAt") as number, planName: (d.get("planName") as string | undefined) ?? null, name: (d.get("name") as string | undefined) ?? "" }))
    .filter((x) => x.at < LIFETIME && x.at - now <= 30 * DAY)
    .sort((a, b) => a.at - b.at);
  const expiringTop = expiring.slice(0, 10);

  // Revenue per currency (PAY-6): the database sums each currency; the currencies come from the plans and the latest payments.
  const recentPayments = await payments.orderBy("activatedAt", "desc").limit(200).select("currency").get();
  const currencies = new Set<string>(["usd"]);
  for (const p of plans) if (p.currency) currencies.add(p.currency.toLowerCase());
  for (const d of recentPayments.docs) { const c = d.get("currency"); if (typeof c === "string" && c) currencies.add(c.toLowerCase()); }
  const revenueByCurrency: Record<string, number> = {};
  for (const currency of currencies) {
    const sum = await payments.where("currency", "==", currency).aggregate({ total: AggregateField.sum("amountTotal") }).get();
    const total = Number(sum.data().total ?? 0);
    if (total > 0) revenueByCurrency[currency] = Math.round(total) / 100; // minor units; zero-decimal currencies are handled when displaying (PAY-6)
  }

  const recent = await users.orderBy("createdAt", "desc").limit(5).select("name", "createdAt", "subscriptionStatus", "subscriptionExpiresAt").get();
  const who = await people([...expiringTop.map((x) => x.id), ...recent.docs.map((d) => d.id)]);
  const person = (uid: string, fallbackName = ""): OverviewPerson => {
    const found = who.get(uid);
    return found ? { ...found, displayName: fallbackName || found.displayName } : { uid, email: "", displayName: fallbackName, photoURL: null };
  };

  return {
    computedAt: now,
    stats: {
      totalUsers, newUsers7d, newUsers30d, activeSubscriptions: active.length, monthlySubscriptions: monthly, yearlySubscriptions: yearly, compSubscriptions: comp,
      freeCodeSignups, totalGalleries, newGalleries30d, revenueByCurrency, revenueUsd: revenueByCurrency.usd ?? 0, paymentCount: paidCount,
      expiringSoonCount: expiring.length, planCount: plans.length, publicPlanCount: plans.filter((p) => p.active && p.isPublic).length,
    },
    expiringSoon: expiringTop.map((x) => ({ ...person(x.id, x.name), expiresAt: x.at, daysLeft: Math.max(0, Math.ceil((x.at - now) / DAY)), planName: x.planName })),
    recentUsers: recent.docs.map((d) => ({
      ...person(d.id, (d.get("name") as string | undefined) ?? ""),
      createdAt: toMs(d.get("createdAt")),
      subscriptionActive: d.get("subscriptionStatus") === "active" && ((d.get("subscriptionExpiresAt") as number | undefined) ?? 0) > now,
    })),
  };
}

const overviewDoc = (db: Firestore) => systemStateDoc("stats-overview", db);

/** Compute now and store it, replacing the stored document. */
export async function recomputeOverview(db: Firestore = getAdminDb(), now = Date.now()): Promise<Overview> {
  const overview = await computeOverview(db, now);
  await overviewDoc(db).set(overview);
  return overview;
}

/** The stored overview if it is younger than ten minutes, otherwise a fresh one (which is stored). One document read in the common case. */
export async function readOverview(db: Firestore = getAdminDb(), now = Date.now()): Promise<{ overview: Overview; cached: boolean }> {
  const snap = await overviewDoc(db).get();
  const stored = snap.exists ? (snap.data() as Overview) : null;
  if (stored && typeof stored.computedAt === "number" && now - stored.computedAt < OVERVIEW_TTL_MS) return { overview: stored, cached: true };
  return { overview: await recomputeOverview(db, now), cached: false };
}
