import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearEmulators, testDb } from "../helpers/db";
import { seedPayment, seedPlan, seedUser } from "../helpers/seed";
import { sessionFixture } from "../helpers/stripe";
import { DAY_MS, MONTH_MS, YEAR_MS } from "@/lib/server/billing/access";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const retrieve = vi.fn();
vi.mock("@/lib/server/billing/stripe", async (orig) => ({
  ...(await orig<typeof import("@/lib/server/billing/stripe")>()),
  getStripe: () => ({ checkout: { sessions: { retrieve } } }),
}));

const { fulfilCheckoutSession, UnmatchedPayment } = await import("@/lib/server/billing/fulfil");

const NOW = Date.UTC(2026, 10, 25, 12);
const now = () => NOW;
const fulfil = (s: Parameters<typeof fulfilCheckoutSession>[0], source: "webhook" | "verify" = "webhook") =>
  fulfilCheckoutSession(s, { source, now });
const user = (uid = "u1") => testDb().collection("users").doc(uid).get().then((s) => s.data()!);
const payment = (id: string) => testDb().collection("payments").doc(id).get().then((s) => s.data());
const monthly = (id: string) =>
  sessionFixture("paid", { id, metadata: { uid: "u1", planId: "m", interval: "monthly" } });
const yearly = (id: string) =>
  sessionFixture("paid", { id, metadata: { uid: "u1", planId: "y", interval: "yearly" } });

beforeEach(async () => {
  await clearEmulators();
  retrieve.mockReset();
  await seedPlan("m", { name: "Monthly", interval: "monthly" });
  await seedPlan("y", { name: "Yearly", interval: "yearly" });
});

describe("new purchase", () => {
  it("grants the plan period from now and records the payment", async () => {
    await seedUser("u1");
    const res = await fulfil(yearly("cs_1"));
    expect(res).toMatchObject({ state: "fulfilled", uid: "u1", grantedMs: YEAR_MS, expiresAt: NOW + YEAR_MS });
    expect(await user()).toMatchObject({
      subscriptionStatus: "active",
      subscriptionExpiresAt: NOW + YEAR_MS,
      subscriptionSource: "paid",
      planId: "y",
      planName: "Yearly",
      planInterval: "yearly",
      stripeCustomerId: "cus_test_1",
    });
    expect(await payment("cs_1")).toMatchObject({
      uid: "u1",
      status: "fulfilled",
      grantedMs: YEAR_MS,
      expiresAtAfter: NOW + YEAR_MS,
      fulfilledBy: "webhook",
      source: "paid",
      amountTotal: 9900,
      activatedAt: NOW,
    });
  });
});

describe("renewals (PAY-1 / PAY-2)", () => {
  it("expired customer: starts again from now", async () => {
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: NOW - 3 * DAY_MS });
    await fulfil(monthly("cs_2"));
    expect((await user()).subscriptionExpiresAt).toBe(NOW + MONTH_MS);
  });

  it("active customer: extends from the current expiry", async () => {
    const cur = NOW + 10 * DAY_MS;
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: cur });
    await fulfil(monthly("cs_3"));
    expect((await user()).subscriptionExpiresAt).toBe(cur + MONTH_MS);
  });

  it("monthly → yearly upgrade stacks both and updates the plan snapshot", async () => {
    await seedUser("u1");
    await fulfil(monthly("cs_a"));
    await fulfil(yearly("cs_b"));
    expect(await user()).toMatchObject({
      subscriptionExpiresAt: NOW + MONTH_MS + YEAR_MS,
      planId: "y",
      planInterval: "yearly",
    });
  });

  it("lifetime accounts keep their expiry but the payment is still recorded", async () => {
    const LIFETIME = 32_503_680_000_000;
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: LIFETIME });
    await fulfil(yearly("cs_l"));
    expect((await user()).subscriptionExpiresAt).toBe(LIFETIME);
    expect((await payment("cs_l"))?.expiresAtAfter).toBe(LIFETIME);
  });
});

describe("idempotency", () => {
  it("a replay changes nothing and reports already_fulfilled", async () => {
    await seedUser("u1");
    await fulfil(yearly("cs_r"));
    const res = await fulfil(yearly("cs_r"), "verify");
    expect(res).toMatchObject({ state: "already_fulfilled", uid: "u1", expiresAt: NOW + YEAR_MS });
    expect((await user()).subscriptionExpiresAt).toBe(NOW + YEAR_MS);
    expect((await payment("cs_r"))?.fulfilledBy).toBe("webhook");
  });

  it("concurrent calls for one session grant exactly once", async () => {
    await seedUser("u1");
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => fulfil(yearly("cs_race"), i % 2 ? "webhook" : "verify")),
    );
    expect(results.filter((r) => r.state === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.state === "already_fulfilled")).toHaveLength(7);
    expect((await user()).subscriptionExpiresAt).toBe(NOW + YEAR_MS);
  });

  it("concurrent calls for DIFFERENT sessions both stack", async () => {
    await seedUser("u1");
    await Promise.all([fulfil(monthly("cs_x")), fulfil(monthly("cs_y"))]);
    expect((await user()).subscriptionExpiresAt).toBe(NOW + 2 * MONTH_MS);
  });

  it("a payment document written before S1-03 (no status) counts as fulfilled", async () => {
    await seedUser("u1", { subscriptionExpiresAt: NOW + DAY_MS });
    await seedPayment("cs_old", { uid: "u1", planId: "y" });
    const res = await fulfil(yearly("cs_old"));
    expect(res).toMatchObject({ state: "already_fulfilled", expiresAt: NOW + DAY_MS });
    expect((await user()).subscriptionExpiresAt).toBe(NOW + DAY_MS);
  });
});

describe("not settled / unresolvable", () => {
  it("returns pending and writes nothing for an unpaid session", async () => {
    await seedUser("u1");
    const res = await fulfil(sessionFixture("async_pending", { id: "cs_p" }));
    expect(res).toEqual({ state: "pending", sessionId: "cs_p" });
    expect(await payment("cs_p")).toBeUndefined();
    expect((await user()).subscriptionExpiresAt).toBeUndefined();
  });

  it("falls back to client_reference_id, then to the customer's e-mail", async () => {
    await seedUser("u1");
    await seedUser("u2", {}, "buyer@example.com");
    await fulfil(sessionFixture("paid", { id: "cs_ref", metadata: {}, client_reference_id: "u1" }));
    expect((await user("u1")).subscriptionExpiresAt).toBe(NOW + YEAR_MS);
    // a different (here: no) Stripe customer, so the customer-id lookup cannot match u1
    await fulfil(sessionFixture("paid", { id: "cs_mail", metadata: {}, customer: null, customer_email: "buyer@example.com" }));
    expect((await user("u2")).subscriptionExpiresAt).toBe(NOW + YEAR_MS);
  });

  it("throws UnmatchedPayment and records nothing when no user can be found", async () => {
    const s = sessionFixture("paid", { id: "cs_none", metadata: {}, customer_email: "nobody@example.com" });
    await expect(fulfil(s)).rejects.toBeInstanceOf(UnmatchedPayment);
    expect(await payment("cs_none")).toBeUndefined();
    await expect(
      fulfil(sessionFixture("paid", { id: "cs_noemail", metadata: {}, customer_email: null })),
    ).rejects.toBeInstanceOf(UnmatchedPayment);
  });

  it("retrieves the session from Stripe when given only an id", async () => {
    await seedUser("u1");
    retrieve.mockResolvedValue(yearly("cs_id"));
    expect(await fulfil("cs_id")).toMatchObject({ state: "fulfilled" });
    expect(retrieve).toHaveBeenCalledWith("cs_id");
  });
});

describe("free (100%-off) codes", () => {
  const freeSession = (id: string) =>
    sessionFixture("no_payment_required", { id, metadata: { uid: "u1", planId: "m", interval: "monthly" } });
  const stripeWithCode = (code: string, accessDays?: string) => ({
    total_details: {
      breakdown: {
        discounts: [{ discount: { promotion_code: { code, metadata: accessDays ? { access_days: accessDays } : {} } } }],
      },
    },
  });

  it("with no rule: grants the chosen plan's period and labels the source", async () => {
    await seedUser("u1");
    retrieve.mockResolvedValue(stripeWithCode("FREEMONTH"));
    await fulfil(freeSession("cs_f1"));
    expect(await user()).toMatchObject({
      subscriptionExpiresAt: NOW + MONTH_MS,
      subscriptionSource: "free_code",
      promoCode: "FREEMONTH",
      // No code rule decided the length, so the plan label is kept (as today).
      planName: "Monthly",
    });
    expect(await payment("cs_f1")).toMatchObject({ source: "free_code", promoCode: "FREEMONTH", grantedMs: MONTH_MS });
  });

  it("a back-office rule decides the length, not the plan", async () => {
    await seedUser("u1");
    await testDb().collection("promoCodes").doc("FREEYEAR").set({ active: true, accessDays: 365 });
    retrieve.mockResolvedValue(stripeWithCode("FREEYEAR"));
    await fulfil(freeSession("cs_f2"));
    expect(await user()).toMatchObject({
      subscriptionExpiresAt: NOW + YEAR_MS,
      planInterval: "yearly",
      planName: "Free code · FREEYEAR",
    });
    expect(await payment("cs_f2")).toMatchObject({ accessDays: 365, accessDaysSource: "back_office" });
  });

  it("Stripe access_days metadata is used when there is no rule", async () => {
    await seedUser("u1");
    retrieve.mockResolvedValue(stripeWithCode("PROMO7", "7"));
    await fulfil(freeSession("cs_f3"));
    expect((await user()).subscriptionExpiresAt).toBe(NOW + 7 * DAY_MS);
  });

  it("a later paid purchase replaces the free-code label", async () => {
    await seedUser("u1");
    retrieve.mockResolvedValue(stripeWithCode("FREEMONTH"));
    await fulfil(freeSession("cs_f4"));
    await fulfil(yearly("cs_paid"));
    const u = await user();
    expect(u.subscriptionSource).toBe("paid");
    expect(u.promoCode).toBeUndefined();
  });

  it("still fulfils when the Stripe promo lookup fails", async () => {
    await seedUser("u1");
    retrieve.mockRejectedValue(new Error("stripe down"));
    expect(await fulfil(freeSession("cs_f5"))).toMatchObject({ state: "fulfilled", grantedMs: MONTH_MS });
  });
});
