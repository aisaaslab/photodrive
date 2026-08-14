import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { getAdminDb } from "@/lib/firebase/admin";

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const uid = session.metadata?.uid;

    if (uid && session.payment_status === "paid") {
      // 1 year = 365 days
      const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;

      try {
        await getAdminDb()
          .collection("users")
          .doc(uid)
          .set(
            {
              subscriptionStatus: "active",
              subscriptionExpiresAt: expiresAt,
              ...(session.customer ? { stripeCustomerId: session.customer } : {}),
            },
            { merge: true }
          );
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
