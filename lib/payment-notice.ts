/**
 * Which payment, if any, the customer should be told about on their dashboard (S2-15). Pure: safe for the browser.
 *
 * A payment that was refunded, disputed or lost a dispute may have reduced or paused the customer's access.
 * An open dispute is always shown; a refund or lost dispute is shown for 30 days; a partial refund changes nothing
 * about access, so it is shown on the account page only. Each message can be dismissed (remembered per payment and status).
 */

export type UserPaymentStatus = "fulfilled" | "refunded" | "partially_refunded" | "disputed" | "dispute_lost";

export type UserPayment = {
  sessionId: string;
  amountTotal: number | null;
  currency: string | null;
  activatedAt: number | null;
  status: UserPaymentStatus;
  refundedAmount: number | null;
  /** When access was last reduced or paused because of this payment, if known. */
  changedAt: number | null;
};

export const BANNER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export const dismissKey = (p: Pick<UserPayment, "sessionId" | "status">) => `payment_notice:${p.sessionId}:${p.status}`;

/** Most serious first. */
const RANK: Partial<Record<UserPaymentStatus, number>> = { disputed: 0, dispute_lost: 1, refunded: 2 };

export function pickBanner(
  payments: UserPayment[],
  now: number,
  isDismissed: (key: string) => boolean = () => false,
): UserPayment | null {
  const candidates = payments.filter((p) => {
    if (RANK[p.status] === undefined) return false;
    if (isDismissed(dismissKey(p))) return false;
    if (p.status === "disputed") return true; // still open: always shown
    return p.changedAt === null || now - p.changedAt <= BANNER_WINDOW_MS;
  });
  candidates.sort((a, b) => RANK[a.status]! - RANK[b.status]! || (b.changedAt ?? 0) - (a.changedAt ?? 0));
  return candidates[0] ?? null;
}
