import type Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";
import { findPaymentIdByPaymentIntent, paymentIntentIdOf } from "@/lib/server/repos/payments";
import { flagPartialRefund, restorePayment, revokePayment, type AdjustResult } from "@/lib/server/billing/adjust";
import type { StripeEventStatus } from "@/lib/firestore/types";

/** What a handler decided; the dispatcher records it on the `stripe_events` document. */
export type Outcome = {
  status: Extract<StripeEventStatus, "processed" | "ignored" | "needs_review">;
  outcome: string;
  sessionId?: string | null;
  uid?: string | null;
  error?: string;
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
  return fromAdjust(r, paymentId, full ? "refund_full" : "refund_partial");
}

/** D5: a dispute suspends the payment's grant and flags it. */
export async function onDisputeCreated(event: Stripe.Event, ctx: HandlerCtx): Promise<Outcome> {
  const dispute = event.data.object as Stripe.Dispute;
  const paymentId = await locate(ctx, paymentIntentIdOf(dispute.payment_intent));
  if (!paymentId) return unmatched("dispute");
  const r = await revokePayment(ctx.db, paymentId, "disputed", { now: ctx.now }, { disputeId: dispute.id });
  return fromAdjust(r, paymentId, "dispute_opened");
}

/** D5: dispute won → restore the grant; lost → revoke for good. Anything else is left for a human. */
export async function onDisputeClosed(event: Stripe.Event, ctx: HandlerCtx): Promise<Outcome> {
  const dispute = event.data.object as Stripe.Dispute;
  const paymentId = await locate(ctx, paymentIntentIdOf(dispute.payment_intent));
  if (!paymentId) return unmatched("dispute");

  if (dispute.status === "won" || dispute.status === "warning_closed") {
    return fromAdjust(await restorePayment(ctx.db, paymentId, { now: ctx.now }), paymentId, "dispute_won");
  }
  if (dispute.status === "lost") {
    const r = await revokePayment(ctx.db, paymentId, "dispute_lost", { now: ctx.now }, { disputeId: dispute.id });
    return fromAdjust(r, paymentId, "dispute_lost");
  }
  return { status: "needs_review", outcome: "dispute_closed_unexpected_status", sessionId: paymentId, error: `status ${dispute.status}` };
}

/** Async payment failed or the Checkout Session expired: no access change, just recorded. */
export function onSessionNotPaid(event: Stripe.Event): Outcome {
  const session = event.data.object as Stripe.Checkout.Session;
  return {
    status: "processed",
    outcome: event.type === "checkout.session.expired" ? "session_expired" : "async_payment_failed",
    sessionId: session.id,
    uid: session.metadata?.uid ?? session.client_reference_id ?? null,
  };
}
