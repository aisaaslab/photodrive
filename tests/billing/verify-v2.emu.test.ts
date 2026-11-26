/** S1-05: /api/stripe/verify on the new fulfilment path, including the race with the webhook. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedUser } from "../helpers/seed";
import { TEST_WEBHOOK_SECRET, eventFixture, sessionFixture, signedWebhookRequest } from "../helpers/stripe";
import { DAY_MS, MONTH_MS } from "@/lib/shared/billing-access";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const { getStripe } = await import("@/lib/server/billing/stripe");
const { POST: verify } = await import("@/app/api/stripe/verify/route");
const { POST: webhook } = await import("@/app/api/stripe/webhook/route");

const paid = (id: string, over = {}) =>
  sessionFixture("paid", { id, metadata: { uid: "u1", planId: "m", interval: "monthly" }, ...over });
const callVerify = (sessionId: string) =>
  verify(
    new NextRequest("http://localhost/api/stripe/verify", {
      method: "POST",
      headers: { authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({ sessionId }),
    }),
  );
const user = () => testDb().collection("users").doc("u1").get().then((s) => s.data()!);

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);
  vi.stubEnv("BILLING_FULFIL_V2", "1");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  vi.spyOn(testAuth(), "verifyIdToken").mockResolvedValue({ uid: "u1", email: "u1@example.com" } as never);
  await seedUser("u1");
});

const stripeReturns = (session: unknown) =>
  vi.spyOn(getStripe().checkout.sessions, "retrieve").mockResolvedValue(session as never);

describe("verify (BILLING_FULFIL_V2=1)", () => {
  it("fulfils a paid session and reports state, expiry and active status", async () => {
    stripeReturns(paid("cs_v1"));
    const res = await callVerify("cs_v1");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ state: "paid", paid: true, activated: true, alreadyFulfilled: false });
    expect(body.expiresAt).toBe((await user()).subscriptionExpiresAt);
  });

  it("extends an already-active customer (PAY-2) and is idempotent on a second call", async () => {
    const cur = Date.now() + 10 * DAY_MS;
    await testDb().collection("users").doc("u1").set({ subscriptionStatus: "active", subscriptionExpiresAt: cur }, { merge: true });
    stripeReturns(paid("cs_v2"));
    await callVerify("cs_v2");
    expect((await user()).subscriptionExpiresAt).toBe(cur + MONTH_MS);
    const again = await (await callVerify("cs_v2")).json();
    expect(again).toMatchObject({ state: "paid", alreadyFulfilled: true });
    expect((await user()).subscriptionExpiresAt).toBe(cur + MONTH_MS);
  });

  it("reports pending for an unsettled session and failed for an expired one", async () => {
    stripeReturns(sessionFixture("async_pending", { id: "cs_p", metadata: { uid: "u1" } }));
    expect(await (await callVerify("cs_p")).json()).toMatchObject({ state: "pending", paid: false });
    stripeReturns(sessionFixture("async_pending", { id: "cs_e", metadata: { uid: "u1" }, status: "expired" }));
    expect(await (await callVerify("cs_e")).json()).toMatchObject({ state: "failed", paid: false });
    expect((await user()).subscriptionExpiresAt).toBeUndefined();
  });

  it("tells a delayed payment (bank debit, transfer) apart from a problem: awaiting, not failed", async () => {
    // checkout completed, money not here yet
    stripeReturns(sessionFixture("async_pending", { id: "cs_sepa", metadata: { uid: "u1" } }));
    expect(await (await callVerify("cs_sepa")).json()).toEqual({ state: "pending", paid: false, status: "unpaid", awaiting: true });
    // checkout not finished (customer still on the Stripe page): nothing to wait for yet
    stripeReturns(sessionFixture("async_pending", { id: "cs_open", metadata: { uid: "u1" }, status: "open" }));
    expect(await (await callVerify("cs_open")).json()).not.toHaveProperty("awaiting");
    // expired: failed, not awaiting
    stripeReturns(sessionFixture("async_pending", { id: "cs_exp", metadata: { uid: "u1" }, status: "expired" }));
    expect(await (await callVerify("cs_exp")).json()).toMatchObject({ state: "failed" });
    expect(await (await callVerify("cs_exp")).json()).not.toHaveProperty("awaiting");
    // paid: never awaiting
    stripeReturns(paid("cs_paid"));
    expect(await (await callVerify("cs_paid")).json()).not.toHaveProperty("awaiting");
  });

  it("a delayed payment end to end: awaiting, then Stripe reports it cleared, then access is active", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);
    stripeReturns(sessionFixture("async_pending", { id: "cs_delay", metadata: { uid: "u1", planId: "m", interval: "monthly" } }));
    expect(await (await callVerify("cs_delay")).json()).toMatchObject({ state: "pending", awaiting: true });
    expect((await user()).subscriptionExpiresAt).toBeUndefined(); // nothing is granted before the money arrives

    // days later: checkout.session.async_payment_succeeded
    const cleared = paid("cs_delay");
    const res = await webhook(signedWebhookRequest(eventFixture("checkout.session.async_payment_succeeded", cleared, "evt_async_ok")) as never);
    expect(res.status).toBe(200);
    expect(((await user()).subscriptionExpiresAt as number) - Date.now()).toBeGreaterThan(MONTH_MS - 60_000);

    stripeReturns(cleared);
    expect(await (await callVerify("cs_delay")).json()).toMatchObject({ state: "paid", activated: true, alreadyFulfilled: true });
  });

  it("refuses a session that belongs to someone else, even with a matching e-mail", async () => {
    stripeReturns(paid("cs_other", { metadata: { uid: "someone-else" }, customer_email: "u1@example.com" }));
    expect((await callVerify("cs_other")).status).toBe(403);
    expect((await user()).subscriptionExpiresAt).toBeUndefined();
  });

  it("falls back to the e-mail for sessions with no uid", async () => {
    stripeReturns(paid("cs_mail", { metadata: {}, customer_email: "U1@example.com" }));
    expect((await callVerify("cs_mail")).status).toBe(200);
    expect((await user()).subscriptionExpiresAt).toBeGreaterThan(Date.now());
  });

  it("returns 500 (and grants nothing) when the session cannot be matched to the caller's account", async () => {
    stripeReturns(paid("cs_x", { metadata: {}, customer_email: "u1@example.com" }));
    vi.spyOn(testAuth(), "getUserByEmail").mockRejectedValue(new Error("not found"));
    expect((await callVerify("cs_x")).status).toBe(500);
  });
});

describe("verify misconfiguration (S1-10)", () => {
  it("answers 500 'Payments are not configured' when the Stripe key is missing", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const res = await callVerify("cs_cfg");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Payments are not configured" });
  });
});

describe("verify and webhook racing on one session", () => {
  it("results in exactly one fulfilment, whatever the interleaving", async () => {
    const before = Date.now();
    const session = paid("cs_race");
    stripeReturns(session);
    const event = eventFixture("checkout.session.completed", session, "evt_race");
    const results = await Promise.all([
      callVerify("cs_race"),
      webhook(new NextRequest(signedWebhookRequest(event))),
      callVerify("cs_race"),
      webhook(new NextRequest(signedWebhookRequest(event))),
    ]);
    // verify always answers 200. A webhook delivery that arrives while another delivery of the same event is
    // still being processed answers 409 (S2-01) so that Stripe retries; both outcomes are correct here.
    const [v1, w1, v2, w2] = results.map((r) => r.status);
    expect([v1, v2]).toEqual([200, 200]);
    for (const w of [w1, w2]) expect([200, 409]).toContain(w);
    const after = Date.now();
    const u = await user();
    // Exactly one month granted (not two), whenever in [before, after] the fulfilment ran: no wall-clock tolerance needed,
    // so a slow CI runner cannot make this flaky.
    expect(u.subscriptionExpiresAt).toBeGreaterThanOrEqual(before + MONTH_MS);
    expect(u.subscriptionExpiresAt).toBeLessThanOrEqual(after + MONTH_MS);
    const payments = await testDb().collection("payments").where("uid", "==", "u1").get();
    expect(payments.size).toBe(1);
  });
});

describe("verify (flag off) keeps the legacy response", () => {
  it("still answers { paid, activated } without a state", async () => {
    vi.stubEnv("BILLING_FULFIL_V2", "0");
    stripeReturns(paid("cs_legacy"));
    const body = await (await callVerify("cs_legacy")).json();
    expect(body).toEqual({ paid: true, activated: true });
  });
});
