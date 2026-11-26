import "server-only";
import type Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";
import { findPaymentIdByPaymentIntent, paymentIntentIdOf } from "@/lib/server/repos/payments";
import { flagPartialRefund, restorePayment, revokePayment, type AdjustResult } from "@/lib/server/billing/adjust";
import type { StripeEventStatus } from "@/lib/firestore/types";
import type { NoticeKind } from "@/lib/server/notify/templates";

/** What a handler decided; the dispatcher records it on the `stripe_events` document. */
export type Outcome = {
  status: Extract<StripeEventStatus, "processed" | "ignored" | "needs_review">;
  outcome: string;
  sessionId?: string | null;
  uid?: string | null;
  error?: string;
  /** A message to send the customer about this event (S2-14); the dispatcher sends it, best effort, once. */
  notice?: { kind: NoticeKind; refId: string; amountMinor?: number | null; refundedMinor?: number | null; currency?: string | null };
};

export type HandlerCtx = { db: Firestore; stripe: Pick<Stripe, "checkout">; now: number };

async function locate(ctx: HandlerCtx, pi: string | null): Promise<string | null> {
  return pi ? findPaymentIdByPaymentIntent(ctx.db, pi, ctx.stripe) : null;
}

const unmatched = (what: string): Outcome => ({
  status: "needs_review",
  outcome: "payment_not_found",
  error: `${what}: no matching payment found`,
});

function fromAdjust(r: AdjustResult, paymentId: string, label: string): Outcome {
  if (r.result === "missing") return unmatched(label);
  if (r.result === "noop") return { status: "processed", outcome: `${label}_noop`, sessionId: paymentId };
  const review = r.result === "flagged" || ("legacy" in r && r.legacy);
  return {
    status: review ? "needs_review" : "processed",
    outcome: `${label}_${r.result}`,
    sessionId: paymentId,
    uid: r.uid,
  };
}

/** D5: full refund removes that payment's granted time; partial refund only flags it for review. */
export async function onChargeRefunded(event: Stripe.Event, ctx: HandlerCtx): Promise<Outcome> {
  const charge = event.data.object as Stripe.Charge;
  const paymentId = await locate(ctx, paymentIntentIdOf(charge.payment_intent));
  if (!paymentId) return unmatched("refund");

  const full = charge.refunded === true || (charge.amount > 0 && charge.amount_refunded >= charge.amount);
  const r = full
    ? await revokePayment(ctx.db, paymentId, "refunded", { now: ctx.now }, { chargeId: charge.id, refundedAmount: charge.amount_refunded })
    : await flagPartialRefund(ctx.db, paymentId, charge.amount_refunded);
  const out = fromAdjust(r, paymentId, full ? "refund_full" : "refund_partial");
  // Tell the customer when this event actually changed something for them (not on a repeat that did nothing).
  const changed = r.result === "revoked" || r.result === "status_only" || r.result === "flagged";
  if (changed) out.notice = { kind: full ? "refund_full" : "refund_partial", refId: paymentId, amountMinor: charge.amount, refundedMinor: charge.amount_refunded, currency: charge.currency };
  return out;
}

/** D5: a dispute suspends the payment's grant and flags it. */
export async function onDisputeCreated(event: Stripe.Event, ctx: HandlerCtx): Promise<Outcome> {
  const dispute = event.data.object as Stripe.Dispute;
  const paymentId = await locate(ctx, paymentIntentIdOf(dispute.payment_intent));
  if (!paymentId) return unmatched("dispute");
  const r = await revokePayment(ctx.db, paymentId, "disputed", { now: ctx.now }, { disputeId: dispute.id });
  const out = fromAdjust(r, paymentId, "dispute_opened");
  if (r.result === "revoked") out.notice = { kind: "dispute_opened", refId: paymentId, amountMinor: dispute.amount, currency: dispute.currency };
  return out;
}

/** D5: dispute won → restore the grant; lost → revoke for good. Anything else is left for a human. */
export async function onDisputeClosed(event: Stripe.Event, ctx: HandlerCtx): Promise<Outcome> {
  const dispute = event.data.object as Stripe.Dispute;
  const paymentId = await locate(ctx, paymentIntentIdOf(dispute.payment_intent));
  if (!paymentId) return unmatched("dispute");

  if (dispute.status === "won" || dispute.status === "warning_closed") {
    const r = await restorePayment(ctx.db, paymentId, { now: ctx.now });
    const out = fromAdjust(r, paymentId, "dispute_won");
    if (r.result === "restored") out.notice = { kind: "dispute_won", refId: paymentId, amountMinor: dispute.amount, currency: dispute.currency };
    return out;
  }
  if (dispute.status === "lost") {
    const r = await revokePayment(ctx.db, paymentId, "dispute_lost", { now: ctx.now }, { disputeId: dispute.id });
    const out = fromAdjust(r, paymentId, "dispute_lost");
    if (r.result === "revoked" || r.result === "status_only") out.notice = { kind: "dispute_lost", refId: paymentId, amountMinor: dispute.amount, currency: dispute.currency };
    return out;
  }
  return { status: "needs_review", outcome: "dispute_closed_unexpected_status", sessionId: paymentId, error: `status ${dispute.status}` };
}

/** Async payment failed or the Checkout Session expired: no access change, just recorded. */
export function onSessionNotPaid(event: Stripe.Event): Outcome {
  const session = event.data.object as Stripe.Checkout.Session;
  const failed = event.type !== "checkout.session.expired"; // an expired session is an abandoned cart: no message
  const uid = session.metadata?.uid ?? session.client_reference_id ?? null;
  return {
    status: "processed",
    outcome: failed ? "async_payment_failed" : "session_expired",
    sessionId: session.id,
    uid,
    ...(failed && uid ? { notice: { kind: "payment_failed" as const, refId: session.id, amountMinor: session.amount_total, currency: session.currency } } : {}),
  };
}
