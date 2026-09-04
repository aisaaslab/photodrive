import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { stripe } from "@/lib/stripe/server";
import { activateSubscription } from "@/lib/stripe/activate";
import { getPlanById } from "@/lib/plans";
import { APP_NAME } from "@/lib/branding";
import type { PlanInterval } from "@/lib/firestore/types";

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

  // Optional plan selection (monthly / yearly / custom private plan).
  let planId: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.planId === "string" && body.planId) planId = body.planId;
  } catch {
    // No / invalid body — legacy annual checkout.
  }

  let plan = null;
  if (planId) {
    plan = await getPlanById(planId);
    if (!plan || !plan.active) {
      return NextResponse.json({ error: "Plan not found" }, { status: 400 });
    }
  }

  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;

  // Anti-double-charge guard: before sending this user to Stripe again, look
  // for an already-paid session for their email within the last year. If one
  // exists (e.g. they paid earlier but the webhook never landed), activate it
  // instead of taking a second payment. With plans, the guard only matches
  // sessions bought for the SAME plan — switching from monthly to yearly
  // (or the legacy annual) starts a fresh checkout.
  if (decoded.email) {
    try {
      const oneYearAgo = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
      const sessions = await stripe.checkout.sessions.list({
        customer_details: { email: decoded.email },
        status: "complete",
        created: { gte: oneYearAgo },
        limit: 100,
      });
      const paid = sessions.data.find(
        (s) => s.payment_status === "paid" && (s.metadata?.planId ?? null) === (planId ?? null)
      );
      if (paid) {
        await activateSubscription({
          uid: decoded.uid,
          sessionId: paid.id,
          amountTotal: paid.amount_total ?? null,
          currency: paid.currency ?? null,
          stripeCustomerId:
            typeof paid.customer === "string" ? paid.customer : null,
          planId: paid.metadata?.planId ?? null,
          interval: (paid.metadata?.interval as PlanInterval | undefined) ?? null,
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
      plan
        ? {
            price_data: {
              currency: plan.currency || "usd",
              // Shown on the Stripe checkout page and on the customer's
              // receipt, so it names the actual plan the user picked.
              product_data: {
                name: `${APP_NAME} ${plan.name}`,
                ...(plan.description ? { description: plan.description } : {}),
              },
              unit_amount: plan.priceCents,
            },
            quantity: 1,
          }
        : {
            price_data: {
              currency: "usd",
              // Shown on the Stripe checkout page and on the customer's
              // receipt, so it follows NEXT_PUBLIC_APP_NAME rather than being
              // hardcoded.
              product_data: {
                name: `${APP_NAME} Annual license`,
              },
              unit_amount: 9900,
            },
            quantity: 1,
          },
    ],
    metadata: {
      uid: decoded.uid,
      ...(plan ? { planId: plan.id, interval: plan.interval } : {}),
    },
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
