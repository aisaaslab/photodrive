/** S1-04: signed webhook → real fulfilCheckoutSession → emulator Firestore (flag on). */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testDb } from "../helpers/db";
import { seedUser } from "../helpers/seed";
import { TEST_WEBHOOK_SECRET, eventFixture, sessionFixture, signedWebhookRequest } from "../helpers/stripe";
import { DAY_MS, MONTH_MS } from "@/lib/shared/billing-access";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const { POST } = await import("@/app/api/stripe/webhook/route");
const deliver = (event: unknown) => POST(new NextRequest(signedWebhookRequest(event)));
const user = () => testDb().collection("users").doc("u1").get().then((s) => s.data()!);
const completed = (id: string) =>
  eventFixture("checkout.session.completed", sessionFixture("paid", {
    id,
    metadata: { uid: "u1", planId: "m", interval: "monthly" },
  }), "evt_" + id);

beforeEach(async () => {
  await clearEmulators();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);
  vi.stubEnv("BILLING_FULFIL_V2", "1");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

describe("webhook with BILLING_FULFIL_V2=1", () => {
  it("PAY-2 fixed end to end: a payment while active extends the expiry", async () => {
    const cur = Date.now() + 10 * DAY_MS;
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: cur });
    expect((await deliver(completed("cs_w1"))).status).toBe(200);
    expect((await user()).subscriptionExpiresAt).toBe(cur + MONTH_MS);
  });

  it("Stripe redelivering the same event grants nothing more", async () => {
    await seedUser("u1");
    await deliver(completed("cs_w2"));
    const first = (await user()).subscriptionExpiresAt;
    expect((await deliver(completed("cs_w2"))).status).toBe(200);
    expect((await user()).subscriptionExpiresAt).toBe(first);
  });

  it("an unpaid async session changes nothing", async () => {
    await seedUser("u1");
    const event = eventFixture("checkout.session.completed", sessionFixture("async_pending", { id: "cs_w3" }));
    expect((await deliver(event)).status).toBe(200);
    expect((await user()).subscriptionExpiresAt).toBeUndefined();
  });
});

describe("webhook with the flag off keeps the old behaviour", () => {
  it("a payment while active does NOT extend (PAY-2 still present until the flag is on)", async () => {
    vi.stubEnv("BILLING_FULFIL_V2", "0");
    const cur = Date.now() + 10 * DAY_MS;
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: cur });
    expect((await deliver(completed("cs_w4"))).status).toBe(200);
    expect((await user()).subscriptionExpiresAt).toBe(cur);
  });
});
