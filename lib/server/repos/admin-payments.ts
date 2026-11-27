import "server-only";
import { FieldPath, type DocumentData, type Firestore, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { listOpenReviewItems } from "@/lib/server/billing/review";
import { decodeCursor, pageThrough } from "@/lib/server/repos/paging";
import { auditLogCol, paymentsCol, stripeEventsCol, usersCol } from "@/lib/server/repos/collections";
import {
  ASSIGNABLE_OUTCOMES, PAYMENT_FILTERS, matchesPaymentFilter, paymentStatus, stripeDashboardUrl, totalsByCurrency,
  type CurrencyTotals, type PaymentFilter, type ShownStatus,
} from "@/lib/shared/admin-payments";

/**
 * What the admin Payments screen reads (S8-01). Lists are paged with a cursor and need no database index beyond the one the payments
 * already have (`activatedAt`): every filter is applied to the page in memory, which is cheap at the size of this collection.
 */
export { decodeCursor, PAYMENT_FILTERS };
export const MAX_PAGE = 50;
const DAY = 86_400_000;
/** Sorts after every character that can follow a prefix, so `>= prefix` and `<= prefix + END` match "starts with". */
const END = "\uf8ff";

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export type AdminPaymentRow = {
  id: string; uid: string | null; email: string | null; name: string | null;
  amountTotal: number | null; currency: string | null; refundedAmount: number | null;
  activatedAt: number; status: ShownStatus; needsReview: boolean; reviewNote: string | null;
  source: "paid" | "free_code"; promoCode: string | null; interval: string | null;
  livemode: boolean | null; hasInvoice: boolean; stripeUrl: string | null;
};
export type PaymentsPage = { payments: AdminPaymentRow[]; nextCursor: string | null; truncated: boolean };

type Who = { email: string | null; name: string | null };

async function whoIs(db: Firestore, uids: (string | null)[]): Promise<Map<string, Who>> {
  const ids = [...new Set(uids.filter((u): u is string => !!u))];
  const out = new Map<string, Who>();
  if (ids.length === 0) return out;
  const snaps = await db.getAll(...ids.map((id) => usersCol(db).doc(id)));
  snaps.forEach((s, i) => out.set(ids[i], { email: str(s.get("email")), name: str(s.get("name")) }));
  return out;
}

function rowOf(doc: QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot, who: Map<string, Who>): AdminPaymentRow {
  const d = doc.data() ?? {};
  const uid = str(d.uid);
  const w = uid ? who.get(uid) : undefined;
  return {
    id: doc.id, uid, email: w?.email ?? null, name: w?.name ?? null,
    amountTotal: num(d.amountTotal), currency: str(d.currency), refundedAmount: num(d.refundedAmount),
    activatedAt: num(d.activatedAt) ?? 0, status: paymentStatus(d), needsReview: d.needsReview === true, reviewNote: str(d.reviewNote),
    source: d.source === "free_code" ? "free_code" : "paid", promoCode: str(d.promoCode), interval: str(d.interval),
    livemode: typeof d.livemode === "boolean" ? d.livemode : null, hasInvoice: !!str(d.invoiceId),
    stripeUrl: stripeDashboardUrl({ paymentIntentId: str(d.paymentIntentId), sessionId: doc.id, livemode: typeof d.livemode === "boolean" ? d.livemode : null }),
  };
}

/** A search: a Checkout Session id (or its start), a payment id (`pi_…`), or a customer's e-mail (its start). Not paged: at most 50 matches. */
async function search(db: Firestore, q: string): Promise<QueryDocumentSnapshot[]> {
  const needle = q.trim();
  if (needle.startsWith("cs_")) {
    return (await paymentsCol(db).where(FieldPath.documentId(), ">=", needle).where(FieldPath.documentId(), "<=", needle + END).limit(MAX_PAGE).get()).docs;
  }
  if (needle.startsWith("pi_")) return (await paymentsCol(db).where("paymentIntentId", "==", needle).limit(5).get()).docs;
  const lower = needle.toLowerCase();
  const users = await usersCol(db).where("emailLower", ">=", lower).where("emailLower", "<=", lower + END).orderBy("emailLower").limit(5).get();
  const lists = await Promise.all(users.docs.map((u) => paymentsCol(db).where("uid", "==", u.id).orderBy("activatedAt", "desc").limit(MAX_PAGE).get()));
  return lists.flatMap((s) => s.docs).sort((a, b) => (num(b.get("activatedAt")) ?? 0) - (num(a.get("activatedAt")) ?? 0)).slice(0, MAX_PAGE);
}

export async function listPaymentsPage(opts: { q?: string; filter?: PaymentFilter; cursor?: string | null; limit?: number }, db: Firestore = getAdminDb()): Promise<PaymentsPage> {
  const filter: PaymentFilter = opts.filter && PAYMENT_FILTERS.includes(opts.filter) ? opts.filter : "all";
  const limit = Math.min(MAX_PAGE, Math.max(1, Math.floor(opts.limit ?? 25)));
  const q = (opts.q ?? "").trim();
  const keep = (d: DocumentData) => matchesPaymentFilter(filter, d);

  let docs: QueryDocumentSnapshot[];
  let nextCursor: string | null = null;
  if (q) {
    docs = (await search(db, q)).filter((d) => keep(d.data()));
  } else {
    const query: Query = paymentsCol(db).orderBy("activatedAt", "desc").orderBy(FieldPath.documentId(), "desc");
    const page = await pageThrough({ query, field: "activatedAt", limit, cursor: decodeCursor(opts.cursor), keep: filter === "all" ? undefined : keep });
    docs = page.docs; nextCursor = page.nextCursor;
  }
  const who = await whoIs(db, docs.map((d) => str(d.get("uid"))));
  return { payments: docs.map((d) => rowOf(d, who)), nextCursor, truncated: false };
}

export type PaymentEvent = { id: string; type: string; status: string; outcome: string | null; receivedAt: number; error: string | null; resolved: boolean; livemode: boolean | null };
export type PaymentActivity = { id: string; at: number; action: string; actorUid: string; note: string | null };
export type AdminPaymentDetail = {
  payment: AdminPaymentRow;
  details: { paymentIntentId: string | null; customerId: string | null; invoiceId: string | null; planId: string | null; fulfilledBy: string | null; grantedDays: number | null; expiresAtAfter: number | null; revokedAt: number | null; disputeId: string | null; chargeId: string | null };
  customer: { uid: string; email: string | null; name: string | null; subscriptionExpiresAt: number | null } | null;
  events: PaymentEvent[];
  activity: PaymentActivity[];
};

export async function getPaymentDetail(id: string, db: Firestore = getAdminDb()): Promise<AdminPaymentDetail | null> {
  const snap = await paymentsCol(db).doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  const uid = str(d.uid);
  const [who, userSnap, events, audit] = await Promise.all([
    whoIs(db, [uid]),
    uid ? usersCol(db).doc(uid).get() : Promise.resolve(null),
    stripeEventsCol(db).where("sessionId", "==", id).limit(50).get(),
    auditLogCol(db).where("targetId", "==", id).orderBy("at", "desc").limit(15).get(),
  ]);
  return {
    payment: rowOf(snap, who),
    details: {
      paymentIntentId: str(d.paymentIntentId), customerId: str(d.customerId), invoiceId: str(d.invoiceId), planId: str(d.planId),
      fulfilledBy: str(d.fulfilledBy), grantedDays: num(d.grantedMs) === null ? null : Math.round((num(d.grantedMs) as number) / DAY),
      expiresAtAfter: num(d.expiresAtAfter), revokedAt: num(d.revokedAt), disputeId: str(d.disputeId), chargeId: str(d.chargeId),
    },
    customer: uid ? { uid, email: who.get(uid)?.email ?? null, name: who.get(uid)?.name ?? null, subscriptionExpiresAt: userSnap?.exists ? num(userSnap.get("subscriptionExpiresAt")) : null } : null,
    events: events.docs.map((e) => ({
      id: e.id, type: str(e.get("type")) ?? "", status: str(e.get("status")) ?? "", outcome: str(e.get("outcome")), receivedAt: num(e.get("receivedAt")) ?? 0,
      error: str(e.get("error")), resolved: !!e.get("resolvedAt"), livemode: typeof e.get("livemode") === "boolean" ? e.get("livemode") : null,
    })).sort((a, b) => a.receivedAt - b.receivedAt),
    activity: audit.docs.map((a) => ({ id: a.id, at: num(a.get("at")) ?? 0, action: str(a.get("action")) ?? "", actorUid: str(a.get("actorUid")) ?? "", note: str(a.get("note")) })),
  };
}

export type PaymentSummary = { days: number; since: number; byCurrency: CurrencyTotals[]; paidCount: number; freeCodeCount: number; truncated: boolean; needsAttention: number };
const SUMMARY_SCAN = 3000;

/** Totals per currency over the last `days` days (default 30), and how many items need attention. A very busy month is cut at 3,000 payments and says so. */
export async function paymentSummary(opts: { days?: number; now?: number } = {}, db: Firestore = getAdminDb()): Promise<PaymentSummary> {
  const days = opts.days ?? 30;
  const since = (opts.now ?? Date.now()) - days * DAY;
  const [snap, open] = await Promise.all([
    paymentsCol(db).where("activatedAt", ">=", since).orderBy("activatedAt", "desc").limit(SUMMARY_SCAN).get(),
    listOpenReviewItems(db),
  ]);
  const rows = snap.docs.map((d) => d.data());
  return {
    days, since, byCurrency: totalsByCurrency(rows),
    paidCount: rows.filter((r) => r.source !== "free_code").length, freeCodeCount: rows.filter((r) => r.source === "free_code").length,
    truncated: snap.size >= SUMMARY_SCAN, needsAttention: open.events.length + open.payments.length,
  };
}

export type AttentionEvent = { kind: "event"; id: string; type: string; outcome: string; sessionId: string | null; uid: string | null; email: string | null; receivedAt: number; error: string | null; assignable: boolean; stripeUrl: string | null };
export type AttentionPayment = { kind: "payment"; id: string; uid: string | null; email: string | null; status: ShownStatus; reviewNote: string | null; activatedAt: number; amountTotal: number | null; currency: string | null; stripeUrl: string | null };

/** Everything still waiting for a person, oldest first, with the customer's e-mail and a Stripe link, so it can be dealt with in place. */
export async function attentionQueue(db: Firestore = getAdminDb()): Promise<{ events: AttentionEvent[]; payments: AttentionPayment[] }> {
  const open = await listOpenReviewItems(db);
  const who = await whoIs(db, [...open.events.map((e) => e.uid), ...open.payments.map((p) => p.uid)]);
  const payDocs = open.payments.length ? await db.getAll(...open.payments.map((p) => paymentsCol(db).doc(p.id))) : [];
  return {
    events: open.events.map((e) => ({
      kind: "event", id: e.id, type: e.type, outcome: e.outcome, sessionId: e.sessionId, uid: e.uid, email: (e.uid && who.get(e.uid)?.email) || null,
      receivedAt: e.receivedAt, error: e.error, assignable: !!e.sessionId && ASSIGNABLE_OUTCOMES.includes(e.outcome),
      stripeUrl: stripeDashboardUrl({ sessionId: e.sessionId ?? e.id }),
    })),
    payments: open.payments.map((p, i) => ({
      kind: "payment", id: p.id, uid: p.uid, email: (p.uid && who.get(p.uid)?.email) || null, status: paymentStatus({ status: p.status }), reviewNote: p.reviewNote,
      activatedAt: p.activatedAt, amountTotal: p.amountTotal, currency: p.currency,
      stripeUrl: stripeDashboardUrl({ paymentIntentId: str(payDocs[i]?.get("paymentIntentId")), sessionId: p.id, livemode: typeof payDocs[i]?.get("livemode") === "boolean" ? payDocs[i].get("livemode") : null }),
    })),
  };
}
