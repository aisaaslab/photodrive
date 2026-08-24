import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { stripe } from "@/lib/stripe/server";
import { activateSubscription } from "@/lib/stripe/activate";
import { APP_NAME } from "@/lib/branding";

async function getDecoded(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    return await getAdminAuth().verifyIdToken(token);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const decoded = await getDecoded(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;

  // Anti-double-charge guard: before sending this user to Stripe again, look
  // for an already-paid session for their email within the last year. If one
  // exists (e.g. they paid earlier but the webhook never landed), activate it
  // instead of taking a second payment.
  if (decoded.email) {
    try {
      const oneYearAgo = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
      const sessions = await stripe.checkout.sessions.list({
        customer_details: { email: decoded.email },
        status: "complete",
        created: { gte: oneYearAgo },
        limit: 100,
      });
      const paid = sessions.data.find((s) => s.payment_status === "paid");
      if (paid) {
        await activateSubscription({
          uid: decoded.uid,
          sessionId: paid.id,
          amountTotal: paid.amount_total ?? null,
          currency: paid.currency ?? null,
          stripeCustomerId:
            typeof paid.customer === "string" ? paid.customer : null,
        });
        return NextResponse.json({ alreadyPaid: true });
      }
    } catch (err) {
      // If the Stripe lookup fails (e.g. placeholder key in dev), fall
      // through and create a normal checkout session.
      console.error("[stripe checkout] reconciliation lookup failed", err);
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: decoded.email ?? undefined,
    line_items: [
      {
        price_data: {
          currency: "usd",
          // Shown on the Stripe checkout page and on the customer's receipt,
          // so it follows NEXT_PUBLIC_APP_NAME rather than being hardcoded.
          product_data: {
            name: `${APP_NAME} Annual license`,
          },
          unit_amount: 9900,
        },
        quantity: 1,
      },
    ],
    metadata: { uid: decoded.uid },
    allow_promotion_codes: true,
    success_url: `${appUrl}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/subscribe`,
    // "auto" lets Stripe follow the customer's own browser language. Pinning a
    // locale here would show every customer a checkout page in that language.
    locale: "auto",
    payment_method_types: ["card"],
  });

  return NextResponse.json({ url: session.url });
}
