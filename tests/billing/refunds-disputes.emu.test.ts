/** S2-02: refund, dispute and session-failure handling (policy D5), through the real webhook. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testDb } from "../helpers/db";
import { seedPayment, seedUser } from "../helpers/seed";
import {
  TEST_WEBHOOK_SECRET, chargeFixture, disputeFixture, eventFixture, sessionFixture, signedWebhookRequest,
} from "../helpers/stripe";
import { DAY_MS, LIFETIME_SENTINEL, MONTH_MS } from "@/lib/server/billing/access";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const { POST: webhook } = await import("@/app/api/stripe/webhook/route");
const { getStripe } = await import("@/lib/server/billing/stripe");

let n = 0;
const deliver = (type: string, object: unknown) =>
  webhook(new NextRequest(signedWebhookRequest(eventFixture(type, object, `evt_${++n}`))));
const user = (uid = "u1") => testDb().collection("users").doc(uid).get().then((s) => s.data()!);
const pay = (id: string) => testDb().collection("payments").doc(id).get().then((s) => s.data()!);
const lastEvent = async () => (await testDb().collection("stripe_events").doc(`evt_${n}`).get()).data()!;
const near = (actual: number, expected: number, ms = 5000) => expect(Math.abs(actual - expected)).toBeLessThan(ms);

/** A real monthly purchase through the webhook, so payments/{id} is written by fulfilCheckoutSession. */
async function buyMonthly(sessionId: string, paymentIntent: string, uid = "u1") {
  const res = await deliver(
    "checkout.session.completed",
    sessionFixture("paid", {
      id: sessionId,
      metadata: { uid, planId: "m", interval: "monthly" },
      payment_intent: paymentIntent,
    }),
  );
  expect(res.status).toBe(200);
}

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);
  vi.stubEnv("BILLING_FULFIL_V2", "1");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

describe("charge.refunded", () => {
  it("full refund removes exactly that payment's granted time", async () => {
    const original = Date.now() + 10 * DAY_MS;
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: original });
    await buyMonthly("cs_a", "pi_a");
    near((await user()).subscriptionExpiresAt, original + MONTH_MS);

    expect((await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_a" }))).status).toBe(200);
    near((await user()).subscriptionExpiresAt, original);
    expect((await user()).subscriptionStatus).toBe("active");
    expect(await pay("cs_a")).toMatchObject({ status: "refunded", needsReview: false, refundedAmount: 9900, grantedMs: MONTH_MS });
    expect(await lastEvent()).toMatchObject({ status: "processed", outcome: "refund_full_revoked", sessionId: "cs_a", uid: "u1" });
  });

  it("a refund of the only purchase leaves the account expired", async () => {
    await seedUser("u1");
    await buyMonthly("cs_b", "pi_b");
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_b" }));
    expect((await user()).subscriptionExpiresAt).toBeLessThanOrEqual(Date.now());
    expect((await user()).subscriptionStatus).toBe("expired");
  });

  it("only the refunded payment is revoked when several were stacked", async () => {
    await seedUser("u1");
    await buyMonthly("cs_1", "pi_1");
    await buyMonthly("cs_2", "pi_2");
    near((await user()).subscriptionExpiresAt, Date.now() + 2 * MONTH_MS);
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_2" }));
    near((await user()).subscriptionExpiresAt, Date.now() + MONTH_MS);
  });

  it("partial refund changes no access, flags the payment and the event for review", async () => {
    await seedUser("u1");
    await buyMonthly("cs_p", "pi_p");
    const before = (await user()).subscriptionExpiresAt;
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_p", amount_refunded: 2000, refunded: false }));
    expect((await user()).subscriptionExpiresAt).toBe(before);
    expect(await pay("cs_p")).toMatchObject({ status: "partially_refunded", refundedAmount: 2000, needsReview: true });
    expect(await lastEvent()).toMatchObject({ status: "needs_review", outcome: "refund_partial_flagged" });

    // ...and if the rest is refunded later, the grant is revoked once.
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_p" }));
    expect((await pay("cs_p")).status).toBe("refunded");
    expect((await user()).subscriptionExpiresAt).toBeLessThanOrEqual(Date.now());
  });

  it("is idempotent: a replayed event and a second refund event do not revoke twice", async () => {
    await seedUser("u1");
    await buyMonthly("cs_1", "pi_1");
    await buyMonthly("cs_2", "pi_2");
    const event = eventFixture("charge.refunded", chargeFixture({ payment_intent: "pi_1" }), "evt_same");
    await webhook(new NextRequest(signedWebhookRequest(event)));
    await webhook(new NextRequest(signedWebhookRequest(event))); // replay
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_1" })); // different event id, same refund
    expect(await lastEvent()).toMatchObject({ outcome: "refund_full_noop" });
    near((await user()).subscriptionExpiresAt, Date.now() + MONTH_MS);
  });

  it("lifetime accounts keep their access", async () => {
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: LIFETIME_SENTINEL });
    await buyMonthly("cs_l", "pi_l");
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_l" }));
    expect((await user()).subscriptionExpiresAt).toBe(LIFETIME_SENTINEL);
    expect((await pay("cs_l")).status).toBe("refunded");
  });

  it("a refund with no matching payment is recorded as needs_review and answered 200", async () => {
    vi.spyOn(getStripe().checkout.sessions, "list").mockResolvedValue({ data: [] } as never);
    expect((await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_unknown" }))).status).toBe(200);
    expect(await lastEvent()).toMatchObject({ status: "needs_review", outcome: "payment_not_found" });
    const noPi = await deliver("charge.refunded", chargeFixture({ payment_intent: null }));
    expect(noPi.status).toBe(200);
    expect(await lastEvent()).toMatchObject({ status: "needs_review", outcome: "payment_not_found" });
  });

  it("finds a payment written before S1-03 through Stripe, revokes its nominal period and flags it", async () => {
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: Date.now() + 40 * DAY_MS });
    await seedPayment("cs_legacy", { uid: "u1", planId: "m", interval: "monthly" }); // no paymentIntentId, no grantedMs
    vi.spyOn(getStripe().checkout.sessions, "list").mockResolvedValue({ data: [{ id: "cs_legacy" }] } as never);
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_legacy" }));
    near((await user()).subscriptionExpiresAt, Date.now() + 10 * DAY_MS);
    expect(await pay("cs_legacy")).toMatchObject({ status: "refunded", needsReview: true });
    expect(await lastEvent()).toMatchObject({ status: "needs_review", outcome: "refund_full_revoked" });
  });
});

describe("charge.dispute.*", () => {
  it("opened: the grant is suspended and the payment flagged", async () => {
    const original = Date.now() + 10 * DAY_MS;
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: original });
    await buyMonthly("cs_d", "pi_d");
    await deliver("charge.dispute.created", disputeFixture({ payment_intent: "pi_d" }));
    near((await user()).subscriptionExpiresAt, original);
    expect(await pay("cs_d")).toMatchObject({ status: "disputed", needsReview: true, disputeId: "dp_test_1" });
    expect(await lastEvent()).toMatchObject({ status: "processed", outcome: "dispute_opened_revoked" });
  });

  it("won: the suspended time is given back", async () => {
    const original = Date.now() + 10 * DAY_MS;
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: original });
    await buyMonthly("cs_w", "pi_w");
    await deliver("charge.dispute.created", disputeFixture({ payment_intent: "pi_w" }));
    await deliver("charge.dispute.closed", disputeFixture({ payment_intent: "pi_w", status: "won" }));
    near((await user()).subscriptionExpiresAt, original + MONTH_MS);
    expect(await pay("cs_w")).toMatchObject({ status: "fulfilled", needsReview: false });
    expect(await lastEvent()).toMatchObject({ outcome: "dispute_won_restored" });
  });

  it("won when the suspension had already run the account out: access resumes from now", async () => {
    await seedUser("u1");
    await buyMonthly("cs_w2", "pi_w2");
    await deliver("charge.dispute.created", disputeFixture({ payment_intent: "pi_w2" }));
    expect((await user()).subscriptionStatus).toBe("expired");
    await deliver("charge.dispute.closed", disputeFixture({ payment_intent: "pi_w2", status: "won" }));
    near((await user()).subscriptionExpiresAt, Date.now() + MONTH_MS);
    expect((await user()).subscriptionStatus).toBe("active");
  });

  it("lost: the grant stays revoked for good", async () => {
    await seedUser("u1");
    await buyMonthly("cs_x", "pi_x");
    await deliver("charge.dispute.created", disputeFixture({ payment_intent: "pi_x" }));
    await deliver("charge.dispute.closed", disputeFixture({ payment_intent: "pi_x", status: "lost" }));
    expect((await user()).subscriptionExpiresAt).toBeLessThanOrEqual(Date.now());
    expect((await pay("cs_x")).status).toBe("dispute_lost");
  });

  it("lost without having seen 'created' (missed or out-of-order) still revokes", async () => {
    await seedUser("u1");
    await buyMonthly("cs_y", "pi_y");
    await deliver("charge.dispute.closed", disputeFixture({ payment_intent: "pi_y", status: "lost" }));
    expect((await user()).subscriptionExpiresAt).toBeLessThanOrEqual(Date.now());
    expect((await pay("cs_y")).status).toBe("dispute_lost");
  });

  it("dispute then refund takes the time back only once", async () => {
    await seedUser("u1");
    await buyMonthly("cs_1", "pi_1");
    await buyMonthly("cs_2", "pi_2");
    await deliver("charge.dispute.created", disputeFixture({ payment_intent: "pi_2" }));
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_2" }));
    near((await user()).subscriptionExpiresAt, Date.now() + MONTH_MS);
    expect((await pay("cs_2")).status).toBe("refunded");
    // a late "won" must not resurrect a refunded payment
    await deliver("charge.dispute.closed", disputeFixture({ payment_intent: "pi_2", status: "won" }));
    near((await user()).subscriptionExpiresAt, Date.now() + MONTH_MS);
  });

  it("an unexpected closing status is left for a human", async () => {
    await seedUser("u1");
    await buyMonthly("cs_z", "pi_z");
    await deliver("charge.dispute.closed", disputeFixture({ payment_intent: "pi_z", status: "under_review" }));
    expect(await lastEvent()).toMatchObject({ status: "needs_review", outcome: "dispute_closed_unexpected_status" });
    expect((await pay("cs_z")).status).toBe("fulfilled");
  });
});

describe("checkout.session.async_payment_failed / expired", () => {
  it("are recorded without touching access", async () => {
    await seedUser("u1");
    const s = sessionFixture("async_pending", { id: "cs_f", metadata: { uid: "u1" } });
    expect((await deliver("checkout.session.async_payment_failed", s)).status).toBe(200);
    expect(await lastEvent()).toMatchObject({ status: "processed", outcome: "async_payment_failed", sessionId: "cs_f", uid: "u1" });
    await deliver("checkout.session.expired", s);
    expect(await lastEvent()).toMatchObject({ outcome: "session_expired" });
    expect((await user()).subscriptionExpiresAt).toBeUndefined();
    expect((await testDb().collection("payments").get()).size).toBe(0);
  });
});

describe("with the flag off", () => {
  it("refund events are not processed (old path ignores them)", async () => {
    vi.stubEnv("BILLING_FULFIL_V2", "0");
    await seedUser("u1");
    expect((await deliver("charge.refunded", chargeFixture())).status).toBe(200);
    expect((await testDb().collection("stripe_events").get()).size).toBe(0);
  });
});
