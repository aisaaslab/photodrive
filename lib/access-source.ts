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
