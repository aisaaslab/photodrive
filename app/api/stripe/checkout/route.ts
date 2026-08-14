import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { stripe } from "@/lib/stripe/server";
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

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: decoded.email ?? undefined,
    line_items: [
      {
        price_data: {
          currency: "eur",
          // Shown on the Stripe checkout page and on the customer's receipt,
          // so it follows NEXT_PUBLIC_APP_NAME rather than being hardcoded.
          product_data: {
            name: `${APP_NAME} Annual license`,
          },
          unit_amount: 8900,
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
