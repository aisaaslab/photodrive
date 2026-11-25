import type Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";

const idOf = (v: string | { id: string } | null | undefined): string | null => (typeof v === "string" ? v : (v?.id ?? null));
export const paymentIntentIdOf = idOf;

/**
 * Finds the `payments/{checkoutSessionId}` document for a Stripe payment intent (charges and
 * disputes only know the payment intent). Payments written before S1-03 have no `paymentIntentId`,
 * so as a fallback the Checkout Session is looked up in Stripe by payment intent.
 */
export async function findPaymentIdByPaymentIntent(
  db: Firestore,
  paymentIntentId: string,
  stripe: Pick<Stripe, "checkout">,
): Promise<string | null> {
  const direct = await db.collection("payments").where("paymentIntentId", "==", paymentIntentId).limit(1).get();
  if (!direct.empty) return direct.docs[0].id;

  try {
    const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
    const id = sessions.data[0]?.id;
    if (id && (await db.collection("payments").doc(id).get()).exists) return id;
  } catch {
    // Stripe unreachable: treat as not found; the caller flags the event for review.
  }
  return null;
}
