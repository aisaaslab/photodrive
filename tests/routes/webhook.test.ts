import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eventFixture, sessionFixture, signedWebhookRequest } from "../helpers/stripe";
import { TEST_WEBHOOK_SECRET } from "../helpers/stripe";

const activateSubscription = vi.fn();
const resolveUidForSession = vi.fn();
vi.mock("@/lib/stripe/activate", () => ({ activateSubscription, resolveUidForSession }));

const { POST } = await import("@/app/api/stripe/webhook/route");
const call = (req: Request) => POST(new NextRequest(req));

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);
  activateSubscription.mockReset().mockResolvedValue(undefined);
  resolveUidForSession.mockReset().mockImplementation(async (s) => s.metadata?.uid ?? null);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/stripe/webhook (current behaviour)", () => {
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
