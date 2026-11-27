/**
 * Pure rules of the admin Payments screen (S8-01): which status a stored payment shows, what each filter keeps, the totals per currency,
 * and the link into the Stripe dashboard. No I/O, so they are tested on their own and shared by the server and the screen.
 */
export type PaymentFilter = "all" | "paid" | "free_code" | "refunded" | "disputed" | "needs_review";
export const PAYMENT_FILTERS: readonly PaymentFilter[] = ["all", "paid", "free_code", "refunded", "disputed", "needs_review"];

/** The fields of a stored payment these rules read. Older payments (from before refunds were handled) have no `status`. */
export type PaymentFields = {
  status?: unknown; needsReview?: unknown; source?: unknown; amountTotal?: unknown; currency?: unknown; refundedAmount?: unknown; activatedAt?: unknown;
};

export type ShownStatus = "fulfilled" | "refunded" | "partially_refunded" | "disputed" | "dispute_lost";
const STATUSES: readonly string[] = ["fulfilled", "refunded", "partially_refunded", "disputed", "dispute_lost"];

/** What a payment is: fulfilled unless it records a refund or a dispute. */
export const paymentStatus = (d: PaymentFields): ShownStatus => (typeof d.status === "string" && STATUSES.includes(d.status) ? (d.status as ShownStatus) : "fulfilled");

export function matchesPaymentFilter(filter: PaymentFilter, d: PaymentFields): boolean {
  const s = paymentStatus(d);
  switch (filter) {
    case "all": return true;
    case "paid": return s === "fulfilled" && d.source !== "free_code";
    case "free_code": return d.source === "free_code";
    case "refunded": return s === "refunded" || s === "partially_refunded";
    case "disputed": return s === "disputed" || s === "dispute_lost";
    case "needs_review": return d.needsReview === true;
  }
}

export const STATUS_LABEL: Record<ShownStatus, string> = {
  fulfilled: "Paid", refunded: "Refunded", partially_refunded: "Partially refunded", disputed: "Disputed", dispute_lost: "Dispute lost",
};

const money = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

export type CurrencyTotals = {
  currency: string;
  /** Money taken, in the currency's minor units. */
  gross: number;
  /** Money given back (refunds, and the whole amount of a lost dispute). */
  refunded: number;
  net: number;
  /** Paid payments (free-code checkouts are not counted: they are $0). */
  count: number;
};

/**
 * Totals per currency, never summed across currencies (PAY-6). Free-code payments carry no money and are left out. A refund counts
 * its refunded amount (all of it for a full refund), a lost dispute counts the whole payment, an open dispute counts nothing yet.
 */
export function totalsByCurrency(payments: PaymentFields[]): CurrencyTotals[] {
  const by = new Map<string, CurrencyTotals>();
  for (const p of payments) {
    if (p.source === "free_code") continue;
    const gross = money(p.amountTotal);
    if (gross === 0) continue;
    const currency = typeof p.currency === "string" && p.currency ? p.currency.toLowerCase() : "usd";
    const t = by.get(currency) ?? { currency, gross: 0, refunded: 0, net: 0, count: 0 };
    const s = paymentStatus(p);
    const back = s === "refunded" ? Math.min(gross, money(p.refundedAmount) || gross) : s === "partially_refunded" ? Math.min(gross, money(p.refundedAmount)) : s === "dispute_lost" ? gross : 0;
    t.gross += gross; t.refunded += back; t.net += gross - back; t.count += 1;
    by.set(currency, t);
  }
  return [...by.values()].sort((a, b) => b.net - a.net || a.currency.localeCompare(b.currency));
}

/**
 * Where to look a payment up in the Stripe dashboard: its payment when there is one, else a search for the id. Test mode has its own
 * `/test/` path; when the mode is not recorded (older payments) it is read from the id (`cs_test_…`).
 */
export function stripeDashboardUrl(opts: { paymentIntentId?: string | null; sessionId?: string | null; livemode?: boolean | null }): string | null {
  const id = opts.paymentIntentId || opts.sessionId;
  if (!id) return null;
  const test = opts.livemode === false || (opts.livemode == null && /^(cs|pi|ch|dp|evt)_test_/.test(id) );
  const base = `https://dashboard.stripe.com/${test ? "test/" : ""}`;
  return opts.paymentIntentId ? `${base}payments/${encodeURIComponent(opts.paymentIntentId)}` : `${base}search?query=${encodeURIComponent(id)}`;
}

/** The kinds of Stripe event outcome that an operator can fix by choosing the customer. */
export const ASSIGNABLE_OUTCOMES: readonly string[] = ["unmatched_payment"];

const OUTCOME_LABELS: Record<string, string> = {
  unmatched_payment: "Paid, but no customer matched",
  payment_not_found: "Refund or dispute for a payment we have no record of",
  refund_partial_flagged: "Partial refund",
  dispute_closed_unexpected_status: "Dispute closed with an unexpected result",
  async_payment_failed: "Delayed payment failed",
  session_expired: "Checkout expired",
};

/** A Stripe event outcome in words an operator can act on; an unknown one is made readable rather than hidden. */
export function outcomeLabel(outcome: string | null | undefined): string {
  if (!outcome) return "Needs review";
  if (OUTCOME_LABELS[outcome]) return OUTCOME_LABELS[outcome];
  const words = outcome.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
