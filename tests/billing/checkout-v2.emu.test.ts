/** S1-06: checkout only creates sessions (BILLING_FULFIL_V2=1). */
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth } from "../helpers/db";
import { seedPlan, seedUser } from "../helpers/seed";
import { createFakeCustomers } from "../helpers/stripe";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const { getStripe } = await import("@/lib/server/billing/stripe");
const { POST: checkout } = await import("@/app/api/stripe/checkout/route");

const DAY = 24 * 60 * 60 * 1000;
const post = (body: unknown, token: string | null = "tok") =>
  checkout(
    new NextRequest("http://localhost/api/stripe/checkout", {
      method: "POST",
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

let create: MockInstance;
let list: MockInstance;

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("BILLING_FULFIL_V2", "1");
  vi.stubEnv("APP_ENV", "staging");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  // Customers API: an in-memory fake, so checkout never reaches the network (S4-05).
  const fakeCustomers = createFakeCustomers();
  for (const m of ["create", "retrieve", "update", "search"] as const) {
    vi.spyOn(getStripe().customers, m).mockImplementation(fakeCustomers.impl[m] as never);
  }
  create = vi.spyOn(getStripe().checkout.sessions, "create") as unknown as MockInstance;
  create.mockResolvedValue({ url: "https://checkout.stripe.test/s" });
  list = vi.spyOn(getStripe().checkout.sessions, "list") as unknown as MockInstance;
  vi.spyOn(testAuth(), "verifyIdToken").mockResolvedValue({ uid: "u1", email: "u1@example.com" } as never);
  await seedPlan("m", { name: "Monthly", interval: "monthly", priceCents: 900, currency: "usd" });
});

describe("checkout (BILLING_FULFIL_V2=1)", () => {
  it("creates a session with client_reference_id, richer metadata and an idempotency key", async () => {
    await seedUser("u1");
    const body = await (await post({ planId: "m" })).json();
    expect(body).toEqual({ url: "https://checkout.stripe.test/s" });
    const [params, options] = create.mock.calls[0] as [Record<string, unknown>, { idempotencyKey: string }];
    expect(params).toMatchObject({
      client_reference_id: "u1",
      metadata: { uid: "u1", planId: "m", interval: "monthly", env: "staging" },
    });
    expect(options.idempotencyKey).toMatch(/^checkout:u1:m:\d+$/);
  });

  it("does not pin the payment method: Stripe shows the methods enabled in the dashboard (iDEAL, SEPA, ...)", async () => {
    await seedUser("u1");
    await post({ planId: "m" });
    expect(create.mock.calls[0][0]).not.toHaveProperty("payment_method_types");
    expect(create.mock.calls[0][0]).not.toHaveProperty("payment_method_configuration");
  });

  it("never looks up Stripe history and never answers alreadyPaid", async () => {
    await seedUser("u1");
    const body = await (await post({ planId: "m" })).json();
    expect(list).not.toHaveBeenCalled();
    expect(body.alreadyPaid).toBeUndefined();
  });

  it("an active customer can buy again (renewal / upgrade while active)", async () => {
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: Date.now() + 20 * DAY });
    const res = await post({ planId: "m" });
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("a double click within the same minute uses the same idempotency key", async () => {
    await seedUser("u1");
    await post({ planId: "m" });
    await post({ planId: "m" });
    const keys = create.mock.calls.map((c) => (c[1] as { idempotencyKey: string }).idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
  });

  it("different plans get different keys", async () => {
    await seedUser("u1");
    await seedPlan("y", { name: "Yearly", interval: "yearly", priceCents: 9900 });
    await post({ planId: "m" });
    await post({ planId: "y" });
    const keys = create.mock.calls.map((c) => (c[1] as { idempotencyKey: string }).idempotencyKey);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("requires a planId: there is no hard-coded fallback price any more (S1-07)", async () => {
    await seedUser("u1");
    for (const body of [{}, { planId: "" }, { planId: 5 }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "planId is required" });
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("still rejects missing auth (401), unknown plans (400) and inactive plans (400)", async () => {
    expect((await post({ planId: "m" }, null)).status).toBe(401);
    expect((await post({ planId: "nope" })).status).toBe(400);
    await seedPlan("off", { name: "Off", active: false });
    expect((await post({ planId: "off" })).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("checkout misconfiguration (S1-10)", () => {
  it("answers 500 'Payments are not configured' when the Stripe key is missing or live outside production", async () => {
    await seedUser("u1");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const res = await post({ planId: "m" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Payments are not configured" });
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc");
    expect((await post({ planId: "m" })).status).toBe(500);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("checkout (flag off) is unchanged", () => {
  it("sends no client_reference_id, no env and no idempotency key", async () => {
    vi.stubEnv("BILLING_FULFIL_V2", "0");
    list.mockResolvedValue({ data: [] });
    await post({ planId: "m" });
    const [params, options] = create.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(params.client_reference_id).toBeUndefined();
    expect(params.metadata).toEqual({ uid: "u1", planId: "m", interval: "monthly" });
    expect(options).toBeUndefined();
    expect(list).toHaveBeenCalledTimes(1);
  });
});
