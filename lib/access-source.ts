// Server-only helper (import from API routes only — never from client code).

/**
 * How an account got its access, for the back office:
 *  - "admin"     — granted by an admin (comp year / lifetime / assigned plan)
 *  - "free_code" — checked out through Stripe with a 100%-off code ($0 total)
 *  - "paid"      — checked out through Stripe and actually paid
 *
 * New activations stamp `subscriptionSource` on the user doc (see
 * lib/stripe/activate.ts). Accounts activated before that existed are derived
 * from their latest `payments` record: a $0 payment means a free code.
 */
export type AccessSource = "admin" | "free_code" | "paid";

export type LatestPayment = {
  amountTotal: number | null;
  currency: string | null;
  promoCode: string | null;
  activatedAt: number;
};

/** Newest payment per uid from a `payments` collection snapshot. */
export function latestPaymentByUid(
  docs: { data(): FirebaseFirestore.DocumentData }[]
): Map<string, LatestPayment> {
  const out = new Map<string, LatestPayment>();
  for (const doc of docs) {
    const d = doc.data();
    const uid = typeof d.uid === "string" ? d.uid : null;
    if (!uid) continue;
    const activatedAt = typeof d.activatedAt === "number" ? d.activatedAt : 0;
    const prev = out.get(uid);
    if (prev && prev.activatedAt >= activatedAt) continue;
    out.set(uid, {
      amountTotal: typeof d.amountTotal === "number" ? d.amountTotal : null,
      currency: typeof d.currency === "string" ? d.currency : null,
      promoCode: typeof d.promoCode === "string" ? d.promoCode : null,
      activatedAt,
    });
  }
  return out;
}

/**
 * A payment an operator should know about (S2-09): refunded, partly refunded, disputed (or lost), or flagged
 * `needsReview` by the event handlers (S2-02). Shown on the admin users page until the Payments view (S8-01).
 */
export type PaymentFlag = {
  sessionId: string;
  status: "refunded" | "partially_refunded" | "disputed" | "dispute_lost" | "fulfilled";
  needsReview: boolean;
  reviewNote: string | null;
  amountTotal: number | null;
  currency: string | null;
  refundedAmount: number | null;
  activatedAt: number;
};

const FLAGGED = new Set(["refunded", "partially_refunded", "disputed", "dispute_lost"]);
/** Worst first: what the single badge on a user row shows. */
const SEVERITY = ["dispute_lost", "disputed", "refunded", "partially_refunded"];

export function paymentFlagSeverity(f: Pick<PaymentFlag, "status" | "needsReview">): number {
  const i = SEVERITY.indexOf(f.status);
  return i >= 0 ? i : f.needsReview ? SEVERITY.length : SEVERITY.length + 1;
}

/** Problem payments per user, worst first, then newest first. Clean payments are not listed. */
export function paymentFlagsByUid(
  docs: { id: string; data(): FirebaseFirestore.DocumentData }[]
): Map<string, PaymentFlag[]> {
  const out = new Map<string, PaymentFlag[]>();
  for (const doc of docs) {
    const d = doc.data();
    const uid = typeof d.uid === "string" ? d.uid : null;
    if (!uid) continue;
    const status = typeof d.status === "string" ? d.status : "fulfilled";
    const needsReview = d.needsReview === true;
    if (!FLAGGED.has(status) && !needsReview) continue;
    const flag: PaymentFlag = {
      sessionId: doc.id,
      status: (FLAGGED.has(status) ? status : "fulfilled") as PaymentFlag["status"],
      needsReview,
      reviewNote: typeof d.reviewNote === "string" ? d.reviewNote : null,
      amountTotal: typeof d.amountTotal === "number" ? d.amountTotal : null,
      currency: typeof d.currency === "string" ? d.currency : null,
      refundedAmount: typeof d.refundedAmount === "number" ? d.refundedAmount : null,
      activatedAt: typeof d.activatedAt === "number" ? d.activatedAt : 0,
    };
    out.set(uid, [...(out.get(uid) ?? []), flag]);
  }
  for (const list of out.values()) {
    list.sort((a, b) => paymentFlagSeverity(a) - paymentFlagSeverity(b) || b.activatedAt - a.activatedAt);
  }
  return out;
}

export function accessSourceOf(opts: {
  compGranted: boolean;
  subscriptionSource?: unknown;
  latest?: LatestPayment;
}): AccessSource | null {
  if (opts.compGranted) return "admin";
  if (opts.subscriptionSource === "free_code" || opts.subscriptionSource === "paid") {
    return opts.subscriptionSource;
  }
  if (opts.latest) return opts.latest.amountTotal === 0 ? "free_code" : "paid";
  return null;
}
