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

/**
 * An in-memory stand-in for Stripe's Customers API, with the behaviours the code relies on: `create` honours idempotency keys
 * (the same key returns the same customer), `retrieve` throws `resource_missing` for an unknown id and returns `{ deleted: true }`
 * for a deleted one, and `search` understands `metadata['uid']:'…'`.
 */
export function createFakeCustomers() {
  type Fake = { id: string; email?: string; name?: string; metadata: Record<string, string>; deleted?: true };
  const customers = new Map<string, Fake>();
  const keys = new Map<string, string>();
  let n = 0;
  const calls = { create: 0, retrieve: 0, search: 0, update: 0 };
  const api = {
    customers,
    calls,
    seed(id: string, data: Partial<Fake> = {}) {
      customers.set(id, { id, metadata: {}, ...data });
    },
    impl: {
      async create(params: Record<string, unknown>, options?: { idempotencyKey?: string }) {
        calls.create++;
        await Promise.resolve(); // yield, so concurrent callers really interleave
        const key = options?.idempotencyKey;
        if (key && keys.has(key)) return customers.get(keys.get(key)!)!;
        const id = `cus_fake_${++n}`;
        const c: Fake = { id, email: params.email as string | undefined, name: params.name as string | undefined, metadata: (params.metadata as Record<string, string>) ?? {} };
        customers.set(id, c);
        if (key) keys.set(key, id);
        return c;
      },
      async retrieve(id: string) {
        calls.retrieve++;
        const c = customers.get(id);
        if (!c) throw Object.assign(new Error(`No such customer: '${id}'`), { code: "resource_missing", statusCode: 404 });
        return c.deleted ? { id, deleted: true, object: "customer" } : c;
      },
      async update(id: string, params: { metadata?: Record<string, string> }) {
        calls.update++;
        const c = customers.get(id);
        if (!c) throw Object.assign(new Error("No such customer"), { code: "resource_missing", statusCode: 404 });
        c.metadata = { ...c.metadata, ...(params.metadata ?? {}) };
        return c;
      },
      async search(params: { query: string }) {
        calls.search++;
        const uid = /metadata\['uid'\]:'([^']*)'/.exec(params.query)?.[1];
        return { data: [...customers.values()].filter((c) => !c.deleted && uid !== undefined && c.metadata.uid === uid) };
      },
    },
  };
  return api;
}
