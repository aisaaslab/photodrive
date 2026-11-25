import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eventFixture, sessionFixture, signedWebhookRequest } from "../helpers/stripe";
import { TEST_WEBHOOK_SECRET } from "../helpers/stripe";

const activateSubscription = vi.fn();
const resolveUidForSession = vi.fn();
vi.mock("@/lib/stripe/activate", () => ({ activateSubscription, resolveUidForSession }));

const fulfilCheckoutSession = vi.fn();
class UnmatchedPayment extends Error {}
vi.mock("@/lib/server/billing/fulfil", () => ({ fulfilCheckoutSession, UnmatchedPayment }));

const { POST } = await import("@/app/api/stripe/webhook/route");
const call = (req: Request) => POST(new NextRequest(req));

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);
  activateSubscription.mockReset().mockResolvedValue(undefined);
  fulfilCheckoutSession.mockReset().mockResolvedValue({ state: "fulfilled" });
  resolveUidForSession.mockReset().mockImplementation(async (s) => s.metadata?.uid ?? null);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/stripe/webhook (BILLING_FULFIL_V2 off: current behaviour)", () => {
  it("returns 200 and activates for a signed paid checkout.session.completed", async () => {
    const res = await call(signedWebhookRequest(eventFixture("checkout.session.completed", sessionFixture("paid"))));
    expect(res.status).toBe(200);
    expect(activateSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "uid_1", sessionId: "cs_test_paid", planId: "plan_year", interval: "yearly" }),
    );
  });

  it("activates a fully discounted (no_payment_required) session", async () => {
    const res = await call(
      signedWebhookRequest(eventFixture("checkout.session.completed", sessionFixture("no_payment_required"))),
    );
    expect(res.status).toBe(200);
    expect(activateSubscription).toHaveBeenCalledTimes(1);
  });

  it("does not activate an async session that is still unpaid", async () => {
    const res = await call(
      signedWebhookRequest(eventFixture("checkout.session.completed", sessionFixture("async_pending"))),
    );
    expect(res.status).toBe(200);
    expect(activateSubscription).not.toHaveBeenCalled();
  });

  it("returns 500 when activation fails so Stripe retries", async () => {
    activateSubscription.mockRejectedValue(new Error("firestore down"));
    const res = await call(signedWebhookRequest(eventFixture("checkout.session.completed", sessionFixture("paid"))));
    expect(res.status).toBe(500);
  });

  it("rejects a missing signature and a forged signature with 400", async () => {
    const unsigned = new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "{}" });
    expect((await call(unsigned)).status).toBe(400);
    const forged = signedWebhookRequest(eventFixture("checkout.session.completed", sessionFixture("paid")), {
      secret: "whsec_wrong",
    });
    expect((await call(forged)).status).toBe(400);
    expect(activateSubscription).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook (BILLING_FULFIL_V2 on)", () => {
  beforeEach(() => vi.stubEnv("BILLING_FULFIL_V2", "1"));

  const completed = (type = "checkout.session.completed", created?: number) => {
    const event = eventFixture(type, sessionFixture("paid"));
    return created ? { ...event, created } : event;
  };

  it("uses fulfilCheckoutSession (and not the old activator) for both completion events", async () => {
    for (const type of ["checkout.session.completed", "checkout.session.async_payment_succeeded"]) {
      expect((await call(signedWebhookRequest(completed(type)))).status).toBe(200);
    }
    expect(fulfilCheckoutSession).toHaveBeenCalledTimes(2);
    expect(fulfilCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ id: "cs_test_paid" }), { source: "webhook" });
    expect(activateSubscription).not.toHaveBeenCalled();
  });

  it("answers 200 when the session is still pending or was already fulfilled", async () => {
    for (const state of ["pending", "already_fulfilled"]) {
      fulfilCheckoutSession.mockResolvedValue({ state });
      expect((await call(signedWebhookRequest(completed()))).status).toBe(200);
    }
  });

  it("returns 500 so Stripe retries when fulfilment fails", async () => {
    fulfilCheckoutSession.mockRejectedValue(new Error("firestore down"));
    expect((await call(signedWebhookRequest(completed()))).status).toBe(500);
  });

  it("an unmatched payment is retried (500) for 24 h, then acknowledged (200)", async () => {
    fulfilCheckoutSession.mockRejectedValue(new UnmatchedPayment("cs"));
    const hourAgo = Math.floor(Date.now() / 1000) - 3600;
    const twoDaysAgo = Math.floor(Date.now() / 1000) - 48 * 3600;
    expect((await call(signedWebhookRequest(completed("checkout.session.completed", hourAgo)))).status).toBe(500);
    expect((await call(signedWebhookRequest(completed("checkout.session.completed", twoDaysAgo)))).status).toBe(200);
  });

  it("signature handling is unchanged", async () => {
    const forged = signedWebhookRequest(completed(), { secret: "whsec_wrong" });
    expect((await call(forged)).status).toBe(400);
    expect(fulfilCheckoutSession).not.toHaveBeenCalled();
  });

  it("ignores other event types", async () => {
    expect((await call(signedWebhookRequest(eventFixture("charge.refunded", {})))).status).toBe(200);
    expect(fulfilCheckoutSession).not.toHaveBeenCalled();
  });
});
