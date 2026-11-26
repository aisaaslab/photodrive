import { requestLogger } from "@/lib/server/log";
import { appEnv, billingFulfilV2 } from "@/lib/server/billing/flags";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { ensureStripeCustomer } from "@/lib/server/billing/customer";
import { getStripe, StripeConfigError } from "@/lib/server/billing/stripe";
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

  let stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    if (!(err instanceof StripeConfigError)) throw err;
    requestLogger(req, "stripe.checkout").error(err.message);
    return NextResponse.json({ error: "Payments are not configured" }, { status: 500 });
  }

  // A plan is required: the old hard-coded "$99 annual" path was replaced by a seeded
  // default plan (see scripts/migrations/seed-default-plan.ts).
  let planId: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.planId === "string" && body.planId) planId = body.planId;
  } catch {
    // Missing / invalid body: handled below.
  }
  if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });

  const plan = await getPlanById(planId);
  if (!plan || !plan.active) {
    return NextResponse.json({ error: "Plan not found" }, { status: 400 });
  }

  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;

  const v2 = billingFulfilV2();

  // LEGACY (BILLING_FULFIL_V2 off) — Anti-double-charge guard: before sending this user to Stripe again, look
  // for an already-paid session for their email within the last year. If one
  // exists (e.g. they paid earlier but the webhook never landed), activate it
  // instead of taking a second payment. With plans, the guard only matches
  // sessions bought for the SAME plan — switching from monthly to yearly
  // (or the legacy annual) starts a fresh checkout.
  if (!v2 && decoded.email) {
    try {
      const oneYearAgo = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
      const sessions = await stripe.checkout.sessions.list({
        customer_details: { email: decoded.email },
        status: "complete",
        created: { gte: oneYearAgo },
        limit: 100,
      });
      const paid = sessions.data.find(
        (s) => s.payment_status === "paid" && (s.metadata?.planId ?? null) === planId
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
      requestLogger(req, "stripe.checkout").warn("reconciliation lookup failed", { uid: decoded.uid, err });
    }
  }

  // New path: checkout only creates sessions. Whether the customer is new, lapsed
  // or still active, they can buy; fulfilment stacks the time (see fulfil.ts).
  // The idempotency key makes a double click return the same Checkout Session.
  const idempotencyKey = `checkout:${decoded.uid}:${plan.id}:${Math.floor(Date.now() / 60_000)}`;

  // One Stripe Customer per user (S4-05). Best-effort: if Stripe's customer API fails, checkout still works the old way
  // (a guest checkout with the e-mail address) rather than blocking a payment.
  let customerId: string | null = null;
  if (v2) {
    try {
      customerId = await ensureStripeCustomer(stripe, getAdminDb(), { uid: decoded.uid, email: decoded.email, name: decoded.name as string | undefined });
    } catch (err) {
      requestLogger(req, "stripe.checkout").warn("customer lookup failed; using e-mail only", { uid: decoded.uid, err: String(err) });
    }
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      // With a Customer, Stripe takes the e-mail from it and the two parameters cannot be combined.
      ...(customerId ? { customer: customerId } : { customer_email: decoded.email ?? undefined }),
      line_items: [
        {
          price_data: {
            currency: plan.currency || "usd",
            // Shown on the Stripe checkout page and on the customer's receipt, so it
            // names the actual plan the user picked.
            product_data: {
              name: `${APP_NAME} ${plan.name}`,
              ...(plan.description ? { description: plan.description } : {}),
            },
            unit_amount: plan.priceCents,
          },
          quantity: 1,
        },
      ],
      ...(v2 ? { client_reference_id: decoded.uid } : {}),
      metadata: {
        uid: decoded.uid,
        planId: plan.id,
        interval: plan.interval,
        ...(v2 ? { env: appEnv() } : {}),
      },
      allow_promotion_codes: true,
      success_url: `${appUrl}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/subscribe`,
      // "auto" lets Stripe follow the customer's own browser language. Pinning a
      // locale here would show every customer a checkout page in that language.
      locale: "auto",
      payment_method_types: ["card"],
    },
    v2 ? { idempotencyKey } : undefined,
  );

  return NextResponse.json({ url: session.url });
}
