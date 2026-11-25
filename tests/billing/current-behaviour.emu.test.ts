/**
 * S1-01: characterisation of the CURRENT payment code (audit PAY-1, PAY-2).
 *
 * Tests wrapped in `it.fails` assert the CORRECT behaviour and currently fail
 * because of the defect. When the code is fixed they start passing, `it.fails`
 * then reports an error, and the wrapper must be removed (turning them into
 * ordinary regression tests). Runs against the Firebase emulators:
 * `npm run test:emu`.
 *
 * Status: PAY-1 was fixed in S1-06 behind BILLING_FULFIL_V2 (test below now
 * runs with the flag on; the flag-off test keeps documenting the old defect).
 * PAY-2 on the old `activateSubscription` stays an expected failure until that
 * function is deleted (S1-12); the fixed behaviour is tested in fulfil.emu.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedPayment, seedPlan, seedUser } from "../helpers/seed";
import { sessionFixture } from "../helpers/stripe";

const DAY = 24 * 60 * 60 * 1000;
const YEAR = 365 * DAY;
const MONTH = 30 * DAY;

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const sessionsList = vi.fn();
const sessionsCreate = vi.fn();
vi.mock("@/lib/server/billing/stripe", async (orig) => ({
  ...(await orig<typeof import("@/lib/server/billing/stripe")>()),
  getStripe: () => ({ checkout: { sessions: { list: sessionsList, create: sessionsCreate, retrieve: vi.fn() } } }),
}));

const { activateSubscription } = await import("@/lib/stripe/activate");
const { POST: checkout } = await import("@/app/api/stripe/checkout/route");

const user = (uid: string) => testDb().collection("users").doc(uid).get().then((s) => s.data()!);

beforeEach(async () => {
  await clearEmulators();
  sessionsList.mockReset();
  sessionsCreate.mockReset().mockResolvedValue({ url: "https://checkout.stripe.test/new" });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PAY-2: paying while still active", () => {
  const activate = (sessionId: string, interval: "monthly" | "yearly" = "yearly") =>
    activateSubscription({ uid: "u1", sessionId, amountTotal: 9900, currency: "usd", planId: "p", interval });

  it("[works today] a first purchase grants the plan period from now", async () => {
    await seedUser("u1");
    const before = Date.now();
    await activate("cs_1");
    const { subscriptionExpiresAt } = await user("u1");
    expect(subscriptionExpiresAt).toBeGreaterThanOrEqual(before + YEAR);
    expect(subscriptionExpiresAt).toBeLessThan(Date.now() + YEAR + 1000);
  });

  it("[works today] replaying the same session grants nothing more", async () => {
    await seedUser("u1");
    await activate("cs_1");
    const first = (await user("u1")).subscriptionExpiresAt;
    await activate("cs_1");
    expect((await user("u1")).subscriptionExpiresAt).toBe(first);
  });

  it("[works today] an expired customer who pays again gets a fresh period", async () => {
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: Date.now() - 5 * DAY });
    const before = Date.now();
    await activate("cs_2", "monthly");
    expect((await user("u1")).subscriptionExpiresAt).toBeGreaterThanOrEqual(before + MONTH);
  });

  // PAY-2 → fixed by S1-03 (fulfilCheckoutSession stacks via computeExpiry)
  it.fails("a NEW payment while active extends the expiry by the purchased period", async () => {
    const remaining = Date.now() + 10 * DAY;
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: remaining });
    await activate("cs_new_while_active", "monthly");
    // Expected: 10 days remaining + 30 days. Today: unchanged (payment recorded, no time added).
    expect((await user("u1")).subscriptionExpiresAt).toBe(remaining + MONTH);
  });
});

describe("PAY-1: returning customer cannot renew", () => {
  const request = (token = "tok") =>
    new NextRequest("http://localhost/api/stripe/checkout", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ planId: "monthly" }),
    });

  beforeEach(async () => {
    vi.unstubAllEnvs();
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: Date.now() - 2 * DAY });
    await seedPlan("monthly", { interval: "monthly", priceCents: 900, currency: "usd", name: "Monthly" });
    vi.spyOn(testAuth(), "verifyIdToken").mockResolvedValue({ uid: "u1", email: "u1@example.com" } as never);
    // Last month's paid session for the SAME plan, already recorded in payments/.
    await seedPayment("cs_last_month", { uid: "u1", planId: "monthly" });
    sessionsList.mockResolvedValue({
      data: [
        sessionFixture("paid", {
          id: "cs_last_month",
          metadata: { uid: "u1", planId: "monthly", interval: "monthly" },
        }),
      ],
    });
  });

  // PAY-1 → fixed by S1-06 (checkout creates sessions only) when BILLING_FULFIL_V2 is on
  it("[fixed with BILLING_FULFIL_V2=1] a lapsed customer who bought this plan before gets a new Checkout URL", async () => {
    vi.stubEnv("BILLING_FULFIL_V2", "1");
    const res = await checkout(request());
    const body = await res.json();
    // Before the fix: { alreadyPaid: true } and no new session, so the customer stayed expired.
    expect(body.url).toBe("https://checkout.stripe.test/new");
    expect(body.alreadyPaid).toBeUndefined();
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    expect(sessionsList).not.toHaveBeenCalled();
  });

  it("[defect with BILLING_FULFIL_V2 off] returns alreadyPaid and leaves the account expired", async () => {
    const res = await checkout(request());
    expect(await res.json()).toEqual({ alreadyPaid: true });
    expect(sessionsCreate).not.toHaveBeenCalled();
    expect((await user("u1")).subscriptionExpiresAt).toBeLessThan(Date.now());
  });
});
