import Stripe from "stripe";
import { appEnv } from "./flags";

/**
 * Thrown at request time when Stripe is not configured correctly. Routes turn it into a 500 with a
 * clear log line, so a missing or wrong key is obvious (PAY-5) instead of a confusing Stripe error.
 * Nothing here runs at import time, so `next build` works with no Stripe environment.
 */
export class StripeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeConfigError";
  }
}

let cached: { key: string; client: Stripe } | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new StripeConfigError("STRIPE_SECRET_KEY is not set in this environment");

  // Live keys belong to production only: never let staging, previews or local runs touch real money.
  if (/^[sr]k_live_/.test(key) && appEnv() !== "production") {
    throw new StripeConfigError(
      `A live Stripe key is configured but APP_ENV is "${appEnv()}": live keys are only allowed in production`,
    );
  }

  if (cached?.key !== key) cached = { key, client: new Stripe(key) };
  return cached.client;
}

/** Signing secret of this deployment's webhook endpoint. Distinct per endpoint and per mode. */
export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new StripeConfigError("STRIPE_WEBHOOK_SECRET is not set in this environment");
  return secret;
}

/**
 * A Checkout Session is settled when money was collected ("paid") or when a 100%-off coupon meant
 * none was due ("no_payment_required"). Fully discounted sessions never report "paid", so gating on
 * that alone would leave free/test purchases unactivated.
 */
export function isSessionSettled(session: Pick<Stripe.Checkout.Session, "payment_status">): boolean {
  return session.payment_status === "paid" || session.payment_status === "no_payment_required";
}

const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/** Stripe minor units → major units (e.g. 1250 usd → 12.5, 500 jpy → 500). */
export function fromMinorUnits(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? amount : amount / 100;
}
