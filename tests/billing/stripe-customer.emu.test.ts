/** S4-05: one Stripe Customer per user, reused by every purchase. */
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedPlan, seedUser } from "../helpers/seed";
import { createFakeCustomers } from "../helpers/stripe";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const { getStripe } = await import("@/lib/server/billing/stripe");
const { ensureStripeCustomer } = await import("@/lib/server/billing/customer");
const { POST: checkout } = await import("@/app/api/stripe/checkout/route");

let fake: ReturnType<typeof createFakeCustomers>;
let sessions: MockInstance;
let asUser = { uid: "u1", email: "u1@example.com", name: "Una One" };

const post = (planId = "m") =>
  checkout(new NextRequest("http://localhost/api/stripe/checkout", { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify({ planId }) }));
const stored = async (uid = "u1") => (await testDb().collection("users").doc(uid).get()).data()?.stripeCustomerId;
const sessionParams = (i = 0) => sessions.mock.calls[i][0] as Record<string, unknown>;

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("BILLING_FULFIL_V2", "1");
  vi.stubEnv("APP_ENV", "staging");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  fake = createFakeCustomers();
  const c = getStripe().customers;
  vi.spyOn(c, "create").mockImplementation(fake.impl.create as never);
  vi.spyOn(c, "retrieve").mockImplementation(fake.impl.retrieve as never);
  vi.spyOn(c, "update").mockImplementation(fake.impl.update as never);
  vi.spyOn(c, "search").mockImplementation(fake.impl.search as never);
  sessions = vi.spyOn(getStripe().checkout.sessions, "create") as unknown as MockInstance;
  sessions.mockResolvedValue({ url: "https://checkout.stripe.test/s" });
  asUser = { uid: "u1", email: "u1@example.com", name: "Una One" };
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async () => asUser) as never);
  await seedPlan("m", { name: "Monthly", interval: "monthly", priceCents: 900, currency: "usd" });
  await seedUser("u1");
});

describe("checkout with BILLING_FULFIL_V2", () => {
  it("the first purchase creates the customer once, stores its id, and checkout uses `customer` instead of `customer_email`", async () => {
    expect((await post()).status).toBe(200);
    expect(fake.calls.create).toBe(1);
    const id = await stored();
    expect(id).toBe("cus_fake_1");
    expect(fake.customers.get(id)).toMatchObject({ email: "u1@example.com", name: "Una One", metadata: { uid: "u1", env: "staging" } });
    const params = sessionParams();
    expect(params.customer).toBe(id);
    expect(params).not.toHaveProperty("customer_email");
    expect(params).toMatchObject({ client_reference_id: "u1", metadata: { uid: "u1", planId: "m" } });
  });

  it("the second purchase reuses the same Stripe customer (nothing new is created)", async () => {
    await post();
    await post();
    await post();
    expect(fake.calls.create).toBe(1);
    expect(fake.customers.size).toBe(1);
    expect(new Set([0, 1, 2].map((i) => sessionParams(i).customer))).toEqual(new Set(["cus_fake_1"]));
  });

  it("each user gets their own customer", async () => {
    await seedUser("u2");
    await post();
    asUser = { uid: "u2", email: "u2@example.com", name: "Two" };
    await post();
    expect(await stored("u1")).not.toBe(await stored("u2"));
    expect(fake.customers.size).toBe(2);
  });

  it("two simultaneous checkouts for one user still make exactly one customer", async () => {
    await Promise.all([post(), post(), post()]);
    expect(fake.customers.size).toBe(1);
    expect(new Set(sessions.mock.calls.map((c) => (c[0] as { customer: string }).customer)).size).toBe(1);
    expect(await stored()).toBe("cus_fake_1");
  });

  it("if Stripe's customer API fails, checkout still works the old way (guest, by e-mail) instead of blocking the payment", async () => {
    vi.spyOn(getStripe().customers, "search").mockRejectedValue(new Error("stripe down"));
    expect((await post()).status).toBe(200);
    const params = sessionParams();
    expect(params).not.toHaveProperty("customer");
    expect(params.customer_email).toBe("u1@example.com");
    expect(await stored()).toBeUndefined();
  });

  it("with the flag off nothing changes: no customer calls, customer_email as before", async () => {
    vi.stubEnv("BILLING_FULFIL_V2", "");
    vi.spyOn(getStripe().checkout.sessions, "list").mockResolvedValue({ data: [] } as never);
    await post();
    expect(fake.calls).toEqual({ create: 0, retrieve: 0, search: 0, update: 0 });
    expect(sessionParams()).toMatchObject({ customer_email: "u1@example.com" });
    expect(sessionParams()).not.toHaveProperty("customer");
  });
});

describe("ensureStripeCustomer", () => {
  const ensure = (uid = "u1") => ensureStripeCustomer(getStripe(), testDb(), { uid, email: `${uid}@example.com` });

  it("reuses a stored customer that Stripe still has, and tags an untagged old one with the uid", async () => {
    await testDb().collection("users").doc("u1").update({ stripeCustomerId: "cus_old" });
    fake.seed("cus_old", { email: "u1@example.com" });
    expect(await ensure()).toBe("cus_old");
    expect(fake.calls.create).toBe(0);
    expect(fake.customers.get("cus_old")!.metadata.uid).toBe("u1");
  });

  it("replaces a stored id that Stripe does not know (for example one from another mode) or that was deleted", async () => {
    await testDb().collection("users").doc("u1").update({ stripeCustomerId: "cus_gone" });
    const id = await ensure();
    expect(id).toBe("cus_fake_1");
    expect(await stored()).toBe("cus_fake_1");

    fake.customers.get(id)!.deleted = true;
    const next = await ensure();
    expect(next).not.toBe(id);
    expect(await stored()).toBe(next);
  });

  it("adopts a customer found by metadata.uid (created before its id was saved) instead of creating another", async () => {
    fake.seed("cus_orphan", { metadata: { uid: "u1" } });
    expect(await ensure()).toBe("cus_orphan");
    expect(await stored()).toBe("cus_orphan");
    expect(fake.calls.create).toBe(0);
  });

  it("does not adopt another user's customer, or a customer that merely has the same e-mail", async () => {
    fake.seed("cus_other", { email: "u1@example.com", metadata: { uid: "someone-else" } });
    fake.seed("cus_guest", { email: "u1@example.com" });
    expect(await ensure()).toBe("cus_fake_1");
    expect(fake.calls.create).toBe(1);
  });

  it("when another instance stored a customer first, that one wins and is used", async () => {
    const realCreate = fake.impl.create;
    vi.spyOn(getStripe().customers, "create").mockImplementation((async (...args: Parameters<typeof realCreate>) => {
      const made = await realCreate(...args);
      await testDb().collection("users").doc("u1").update({ stripeCustomerId: "cus_winner" }); // the race
      return made;
    }) as never);
    expect(await ensure()).toBe("cus_winner");
    expect(await stored()).toBe("cus_winner");
  });

  it("a uid with quotes cannot break out of the search query", async () => {
    await testDb().collection("users").doc("a'b").set({ email: "x@example.com" });
    await ensure("a'b");
    expect(fake.calls.search).toBe(1);
    const searched = (getStripe().customers.search as unknown as MockInstance).mock.calls[0][0] as { query: string };
    expect(searched.query).toBe("metadata['uid']:'ab'");
  });
});
