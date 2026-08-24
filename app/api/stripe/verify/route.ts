import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { stripe } from "@/lib/stripe/server";
import { activateSubscription } from "@/lib/stripe/activate";

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

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.payment_status !== "paid") {
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
    });
  } catch (err) {
    console.error("[stripe verify] activation write failed for uid", decoded.uid, err);
    return NextResponse.json({ error: "Activation failed" }, { status: 500 });
  }

  return NextResponse.json({ paid: true, activated: true });
}
