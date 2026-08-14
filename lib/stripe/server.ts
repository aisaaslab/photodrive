import Stripe from "stripe";

// Falls back to a dummy key so `next build` succeeds before Stripe is set up
// (same reason lib/firebase/client.ts uses placeholder values). Any real API
// call with this key fails, which is correct — checkout isn't usable until the
// operator fills STRIPE_SECRET_KEY in .env.local.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");
