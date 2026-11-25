import Stripe from "stripe";

export const TEST_WEBHOOK_SECRET = "whsec_test_secret_for_unit_tests";

type SessionOverrides = Partial<Stripe.Checkout.Session> & Record<string, unknown>;

/** A Checkout Session shaped like the ones Stripe sends in webhooks. */
export function sessionFixture(
  kind: "paid" | "no_payment_required" | "async_pending",
  overrides: SessionOverrides = {},
): Stripe.Checkout.Session {
  const base = {
    id: "cs_test_" + kind,
    object: "checkout.session",
    amount_total: 9900,
    currency: "usd",
    customer: "cus_test_1",
    customer_email: "buyer@example.com",
    mode: "payment",
    metadata: { uid: "uid_1", planId: "plan_year", interval: "yearly" },
    payment_status: "paid",
    status: "complete",
  };
  if (kind === "no_payment_required") Object.assign(base, { amount_total: 0, payment_status: "no_payment_required" });
  if (kind === "async_pending") Object.assign(base, { payment_status: "unpaid" });
  return { ...base, ...overrides } as unknown as Stripe.Checkout.Session;
}

export function eventFixture(type: string, object: unknown, id = "evt_test_1", livemode = false) {
  return {
    id,
    object: "event",
    api_version: "2025-01-01",
    created: Math.floor(Date.now() / 1000),
    livemode,
    type,
    data: { object },
  };
}

/** Build a correctly signed webhook `Request` (use `secret` to test forgeries). */
export function signedWebhookRequest(
  event: unknown,
  { secret = TEST_WEBHOOK_SECRET, url = "http://localhost/api/stripe/webhook" } = {},
): Request {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request(url, { method: "POST", body: payload, headers: { "stripe-signature": signature } });
}

/** A Charge as sent in `charge.refunded` events. */
export function chargeFixture(over: Record<string, unknown> = {}) {
  return { id: "ch_test_1", object: "charge", payment_intent: "pi_test_1", amount: 9900, amount_refunded: 9900, refunded: true, currency: "usd", ...over };
}

/** A Dispute as sent in `charge.dispute.*` events. */
export function disputeFixture(over: Record<string, unknown> = {}) {
  return { id: "dp_test_1", object: "dispute", charge: "ch_test_1", payment_intent: "pi_test_1", amount: 9900, currency: "usd", status: "needs_response", ...over };
}
