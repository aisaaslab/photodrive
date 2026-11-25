import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, isSessionSettled } from "@/lib/stripe/server";
import { activateSubscription, resolveUidForSession } from "@/lib/stripe/activate";
import { requestLogger } from "@/lib/server/log";
import { billingFulfilV2 } from "@/lib/server/billing/flags";
import { fulfilCheckoutSession, UnmatchedPayment } from "@/lib/server/billing/fulfil";

// An unmatched payment is retried by Stripe (we answer 500) for this long, then left to the
// reconciliation / "needs attention" flow (S2) so Stripe stops retrying.
const UNMATCHED_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const log = requestLogger(req, "stripe.webhook");
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    log.warn("rejected: request has no stripe-signature header");
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Misconfiguration, not a bad request — 500 so it is not mistaken for a
    // forged call, and so the cause is obvious in the logs.
    log.error("STRIPE_WEBHOOK_SECRET is not set in this environment");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    // Most common cause: the secret belongs to a different endpoint or mode
    // (test vs live, or a `stripe listen` secret). Log the Stripe message only —
    // never the secret or signature.
    log.warn("signature verification failed: check STRIPE_WEBHOOK_SECRET matches this endpoint's signing secret and mode", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  log.info("received", { type: event.type, eventId: event.id, mode: event.livemode ? "live" : "test" });

  const isCompleted =
    event.type === "checkout.session.completed" ||
    // Deferred-payment methods (e.g. some bank debits) succeed asynchronously:
    // the session starts "processing" and this event fires when funds clear.
    event.type === "checkout.session.async_payment_succeeded";

  if (isCompleted) {
    // Both event types carry a Checkout Session payload, but the union of all
    // event types can't be narrowed automatically — cast to the Session type.
    const session = event.data.object as Stripe.Checkout.Session;

    if (billingFulfilV2()) {
      try {
        const result = await fulfilCheckoutSession(session, { source: "webhook" });
        log.info("fulfilment", { sessionId: session.id, state: result.state });
        return NextResponse.json({ received: true });
      } catch (err) {
        if (err instanceof UnmatchedPayment) {
          const ageMs = Date.now() - event.created * 1000;
          if (ageMs < UNMATCHED_RETRY_WINDOW_MS) {
            // Return 500 so Stripe retries: the user may still be created or e-mail-matched.
            log.error("settled payment could not be matched to a user, will be retried", {
              sessionId: session.id,
              eventId: event.id,
            });
            return NextResponse.json({ error: "Unmatched payment" }, { status: 500 });
          }
          log.error("settled payment still unmatched after retry window, needs manual review", {
            sessionId: session.id,
            eventId: event.id,
          });
          return NextResponse.json({ received: true });
        }
        log.error("fulfilment failed", { sessionId: session.id, err });
        return NextResponse.json({ error: "Activation failed" }, { status: 500 });
      }
    }

    // Fall back to the session email when metadata.uid is missing so a paid
    // customer is never silently dropped (previously this logged + returned
    // 200, so Stripe would never retry and the user stayed unsubscribed).
    const uid = await resolveUidForSession(session);

    if (uid && isSessionSettled(session)) {
      try {
        await activateSubscription({
          uid,
          sessionId: session.id,
          amountTotal: session.amount_total ?? null,
          currency: session.currency ?? null,
          stripeCustomerId:
            typeof session.customer === "string" ? session.customer : null,
          planId: session.metadata?.planId ?? null,
          interval: (session.metadata?.interval as "monthly" | "yearly" | undefined) ?? null,
        });
      } catch (err) {
        // Return 500 so Stripe RETRIES — otherwise the customer paid but is never activated.
        log.error("activation write failed", { uid, sessionId: session.id, err });
        return NextResponse.json({ error: "Activation failed" }, { status: 500 });
      }
    } else {
      log.warn("completed session without uid or not paid", {
        uid,
        paymentStatus: session.payment_status,
        sessionId: session.id,
      });
    }
  }

  return NextResponse.json({ received: true });
}
