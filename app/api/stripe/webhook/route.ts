import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { activateSubscription, resolveUidForSession } from "@/lib/stripe/activate";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const isCompleted =
    event.type === "checkout.session.completed" ||
    // Deferred-payment methods (e.g. some bank debits) succeed asynchronously:
    // the session starts "processing" and this event fires when funds clear.
    event.type === "checkout.session.async_payment_succeeded";

  if (isCompleted) {
    // Both event types carry a Checkout Session payload, but the union of all
    // event types can't be narrowed automatically — cast to the Session type.
    const session = event.data.object as Stripe.Checkout.Session;
    // Fall back to the session email when metadata.uid is missing so a paid
    // customer is never silently dropped (previously this logged + returned
    // 200, so Stripe would never retry and the user stayed unsubscribed).
    const uid = await resolveUidForSession(session);

    if (uid && session.payment_status === "paid") {
      try {
        await activateSubscription({
          uid,
          sessionId: session.id,
          amountTotal: session.amount_total ?? null,
          currency: session.currency ?? null,
          stripeCustomerId:
            typeof session.customer === "string" ? session.customer : null,
        });
      } catch (err) {
        // Return 500 so Stripe RETRIES — otherwise the customer paid but is never activated.
        console.error("[stripe webhook] activation write failed for uid", uid, err);
        return NextResponse.json({ error: "Activation failed" }, { status: 500 });
      }
    } else {
      console.error("[stripe webhook] completed session without uid or not paid", {
        uid,
        payment_status: session.payment_status,
        sessionId: session.id,
      });
    }
  }

  return NextResponse.json({ received: true });
}
