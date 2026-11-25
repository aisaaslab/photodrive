import type Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import { claimEvent, markEvent } from "@/lib/server/repos/stripeEvents";
import { fulfilCheckoutSession, UnmatchedPayment } from "@/lib/server/billing/fulfil";
import { getStripe } from "@/lib/server/billing/stripe";
import { onChargeRefunded, onDisputeClosed, onDisputeCreated, onSessionNotPaid, type Outcome } from "./handlers";
import type { Logger } from "@/lib/server/log";

/** An unmatched payment is retried by Stripe (we answer 500) for this long, then flagged for review. */
export const UNMATCHED_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

export type DispatchResult = { status: number; body: Record<string, unknown> };

const ok: DispatchResult = { status: 200, body: { received: true } };

/**
 * New-path webhook processing (BILLING_FULFIL_V2): record the event, skip it if already handled,
 * dispatch it, record the outcome. Handler errors answer 500 so Stripe retries; the claim logic
 * lets that retry through.
 */
export async function handleStripeEvent(
  event: Stripe.Event,
  log: Logger,
  now: () => number = Date.now,
): Promise<DispatchResult> {
  const db = getAdminDb();

  const claim = await claimEvent(db, event, now());
  if (!claim.claimed) {
    if (claim.reason === "in_flight") {
      log.warn("event is being processed by another delivery, asking Stripe to retry", { eventId: event.id });
      return { status: 409, body: { error: "Event in flight" } };
    }
    log.info("duplicate event ignored", { eventId: event.id, status: claim.status });
    return ok;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      // Deferred-payment methods succeed asynchronously: the session starts "processing" and this
      // event fires when funds clear.
      case "checkout.session.async_payment_succeeded":
        return await onCheckoutSettled(event, log, now);
      case "charge.refunded":
        return await record(event, await onChargeRefunded(event, { db, stripe: getStripe(), now: now() }), log, now);
      case "charge.dispute.created":
        return await record(event, await onDisputeCreated(event, { db, stripe: getStripe(), now: now() }), log, now);
      case "charge.dispute.closed":
        return await record(event, await onDisputeClosed(event, { db, stripe: getStripe(), now: now() }), log, now);
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired":
        return await record(event, onSessionNotPaid(event), log, now);
      default:
        await markEvent(db, event.id, "ignored", {}, now());
        return ok;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("event handler failed", { eventId: event.id, type: event.type, err });
    await markEvent(db, event.id, "failed", { error: message }, now()).catch(() => {});
    return { status: 500, body: { error: "Event handling failed" } };
  }
}

/** Store a handler's decision on the event; payments that need a human are logged loudly. */
async function record(event: Stripe.Event, o: Outcome, log: Logger, now: () => number): Promise<DispatchResult> {
  if (o.status === "needs_review") {
    log.error("event needs manual review", { eventId: event.id, type: event.type, outcome: o.outcome, sessionId: o.sessionId });
  } else {
    log.info("event handled", { eventId: event.id, type: event.type, outcome: o.outcome });
  }
  await markEvent(getAdminDb(), event.id, o.status, { sessionId: o.sessionId, uid: o.uid, outcome: o.outcome, error: o.error }, now());
  return ok;
}

async function onCheckoutSettled(event: Stripe.Event, log: Logger, now: () => number): Promise<DispatchResult> {
  const db = getAdminDb();
  const session = event.data.object as Stripe.Checkout.Session;
  try {
    const result = await fulfilCheckoutSession(session, { source: "webhook", now });
    log.info("fulfilment", { sessionId: session.id, state: result.state });
    await markEvent(
      db,
      event.id,
      "processed",
      { sessionId: session.id, uid: "uid" in result ? result.uid : null, outcome: result.state },
      now(),
    );
    return ok;
  } catch (err) {
    if (!(err instanceof UnmatchedPayment)) throw err;
    const ageMs = now() - event.created * 1000;
    if (ageMs < UNMATCHED_RETRY_WINDOW_MS) {
      // 500 so Stripe retries: the user may still be created or e-mail-matched.
      log.error("settled payment could not be matched to a user, will be retried", {
        sessionId: session.id,
        eventId: event.id,
      });
      await markEvent(db, event.id, "failed", { sessionId: session.id, error: "unmatched payment" }, now());
      return { status: 500, body: { error: "Unmatched payment" } };
    }
    log.error("settled payment still unmatched after retry window, needs manual review", {
      sessionId: session.id,
      eventId: event.id,
    });
    await markEvent(db, event.id, "needs_review", { sessionId: session.id, error: "unmatched payment" }, now());
    return ok;
  }
}
