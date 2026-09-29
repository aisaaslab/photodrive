import Stripe from "stripe";

// Falls back to a dummy key so `next build` succeeds before Stripe is set up
// (same reason lib/firebase/client.ts uses placeholder values). Any real API
// call with this key fails, which is correct — checkout isn't usable until the
// operator fills STRIPE_SECRET_KEY in .env.local.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

/**
 * A Checkout Session is settled when money was collected ("paid") or when a
 * 100%-off coupon meant none was due ("no_payment_required"). Fully
 * discounted sessions never report "paid", so gating on that alone would
 * leave free/test purchases unactivated.
 */
export function isSessionSettled(session: Pick<Stripe.Checkout.Session, "payment_status">): boolean {
  return session.payment_status === "paid" || session.payment_status === "no_payment_required";
}

const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/** Stripe minor units → major units (e.g. 9900 usd → 99, 500 jpy → 500). */
export function fromMinorUnits(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? amount : amount / 100;
}
