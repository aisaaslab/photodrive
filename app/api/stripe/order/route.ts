import { NextRequest, NextResponse } from "next/server";
import { stripe, isSessionSettled, fromMinorUnits } from "@/lib/stripe/server";

/**
 * Public purchase summary for the Thank You page's conversion tracking.
 *
 * Deliberately unauthenticated: the visitor may have lost their login while
 * on Stripe (or paid in an in-app browser), and the pixel must still fire.
 * The Checkout Session ID is an unguessable token that only the paying
 * customer's browser receives. Only non-personal order facts are returned —
 * never email, name, or customer ID — and amounts come from Stripe, not the
 * client, so they can't be spoofed.
 */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id") ?? "";
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.status !== "complete" || !isSessionSettled(session)) {
    return NextResponse.json({ error: "Order not completed" }, { status: 409 });
  }

  const currency = (session.currency ?? "usd").toUpperCase();
  return NextResponse.json(
    {
      transactionId: session.id,
      value: fromMinorUnits(session.amount_total ?? 0, currency),
      currency,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
