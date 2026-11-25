import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getStripe, isSessionSettled, StripeConfigError } from "@/lib/server/billing/stripe";
import { activateSubscription } from "@/lib/stripe/activate";
import { requestLogger } from "@/lib/server/log";
import { billingFulfilV2 } from "@/lib/server/billing/flags";
import { fulfilCheckoutSession } from "@/lib/server/billing/fulfil";

/**
 * Client-side reconciliation for a completed Stripe Checkout session.
 *
 * The webhook is the primary activation path, but if it failed or was
 * misconfigured, this route lets the success page heal the account on its
 * own: it re-fetches the session from Stripe (never trusting the client),
 * checks it was really paid, and activates the subscription if so.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sessionId: string | undefined;
  try {
    const body = await req.json();
    sessionId = body.sessionId;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    if (!(err instanceof StripeConfigError)) throw err;
    requestLogger(req, "stripe.verify").error(err.message);
    return NextResponse.json({ error: "Payments are not configured" }, { status: 500 });
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (billingFulfilV2()) return verifyV2(req, session, decoded);

  if (!isSessionSettled(session)) {
    return NextResponse.json(
      { paid: false, status: session.payment_status },
      { status: 200 }
    );
  }

  // The session must belong to the caller — matched by metadata.uid, or by
  // the email the session was created with.
  const sessionUid = session.metadata?.uid;
  const sessionEmail =
    session.customer_details?.email ?? session.customer_email ?? null;
  const emailMatches =
    !!sessionEmail &&
    !!decoded.email &&
    sessionEmail.toLowerCase() === decoded.email.toLowerCase();

  if (sessionUid !== decoded.uid && !emailMatches) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await activateSubscription({
      uid: decoded.uid,
      sessionId: session.id,
      amountTotal: session.amount_total ?? null,
      currency: session.currency ?? null,
      stripeCustomerId:
        typeof session.customer === "string" ? session.customer : null,
      planId: session.metadata?.planId ?? null,
      interval: (session.metadata?.interval as "monthly" | "yearly" | undefined) ?? null,
    });
  } catch (err) {
    requestLogger(req, "stripe.verify").error("activation write failed", { uid: decoded.uid, sessionId: session.id, err });
    return NextResponse.json({ error: "Activation failed" }, { status: 500 });
  }

  return NextResponse.json({ paid: true, activated: true });
}

/**
 * New path (BILLING_FULFIL_V2): ownership first, then the shared fulfilment.
 * Responds with an explicit `state`:
 *   - "paid"    — access granted (now or earlier); `expiresAt` is the new expiry
 *   - "pending" — payment not settled yet (async method still processing)
 *   - "failed"  — the Checkout Session expired without payment
 * `paid` / `activated` are kept for clients that predate `state`.
 */
async function verifyV2(
  req: NextRequest,
  session: Stripe.Checkout.Session,
  decoded: { uid: string; email?: string },
) {
  // The session must belong to the caller. When it names a user (metadata.uid or
  // client_reference_id) that must be the caller; otherwise the e-mail must match.
  const owner = session.metadata?.uid || session.client_reference_id || null;
  const sessionEmail = session.customer_details?.email ?? session.customer_email ?? null;
  const emailMatches =
    !!sessionEmail && !!decoded.email && sessionEmail.toLowerCase() === decoded.email.toLowerCase();
  if (owner ? owner !== decoded.uid : !emailMatches) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isSessionSettled(session)) {
    const state = session.status === "expired" ? "failed" : "pending";
    return NextResponse.json({ state, paid: false, status: session.payment_status });
  }

  try {
    const result = await fulfilCheckoutSession(session, { source: "verify" });
    if (result.state === "pending") {
      return NextResponse.json({ state: "pending", paid: false, status: session.payment_status });
    }
    return NextResponse.json({
      state: "paid",
      paid: true,
      activated: true,
      expiresAt: result.expiresAt,
      alreadyFulfilled: result.state === "already_fulfilled",
    });
  } catch (err) {
    requestLogger(req, "stripe.verify").error("fulfilment failed", { uid: decoded.uid, sessionId: session.id, err });
    return NextResponse.json({ error: "Activation failed" }, { status: 500 });
  }
}
