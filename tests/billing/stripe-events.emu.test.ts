/** S2-01: stripe_events log. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testDb } from "../helpers/db";
import { seedUser } from "../helpers/seed";
import { TEST_WEBHOOK_SECRET, eventFixture, sessionFixture, signedWebhookRequest } from "../helpers/stripe";
import { STALE_PROCESSING_MS, claimEvent, markEvent } from "@/lib/server/repos/stripeEvents";
import { MONTH_MS } from "@/lib/shared/billing-access";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const { POST: webhook } = await import("@/app/api/stripe/webhook/route");
const fulfilModule = await import("@/lib/server/billing/fulfil");

const evt = { id: "evt_1", type: "checkout.session.completed", livemode: false };
const logDoc = (id: string) => testDb().collection("stripe_events").doc(id).get().then((s) => s.data());
const user = () => testDb().collection("users").doc("u1").get().then((s) => s.data()!);

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);
  vi.stubEnv("BILLING_FULFIL_V2", "1");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

describe("claimEvent / markEvent", () => {
  it("creates the event on first receipt, in 'processing'", async () => {
    expect(await claimEvent(testDb(), evt, 1000)).toEqual({ claimed: true, attempts: 1 });
    expect(await logDoc("evt_1")).toMatchObject({ type: evt.type, livemode: false, receivedAt: 1000, status: "processing", attempts: 1 });
  });

  it("a finished event is a duplicate: processed, ignored and needs_review are all skipped", async () => {
    for (const status of ["processed", "ignored", "needs_review"] as const) {
      const id = `evt_${status}`;
      await claimEvent(testDb(), { ...evt, id }, 1000);
      await markEvent(testDb(), id, status, {}, 2000);
      expect(await claimEvent(testDb(), { ...evt, id }, 3000)).toEqual({ claimed: false, reason: "duplicate", status });
    }
  });

  it("a failed event can be claimed again (Stripe retry) and counts attempts", async () => {
    await claimEvent(testDb(), evt, 1000);
    await markEvent(testDb(), "evt_1", "failed", { error: "boom" }, 1500);
    expect(await claimEvent(testDb(), evt, 2000)).toEqual({ claimed: true, attempts: 2 });
    expect(await logDoc("evt_1")).toMatchObject({ status: "processing", attempts: 2, error: null });
  });

  it("an in-flight event is not claimed twice, but a stale claim is taken over", async () => {
    await claimEvent(testDb(), evt, 1000);
    expect(await claimEvent(testDb(), evt, 1000 + 1000)).toEqual({ claimed: false, reason: "in_flight" });
    expect(await claimEvent(testDb(), evt, 1000 + STALE_PROCESSING_MS + 1)).toEqual({ claimed: true, attempts: 2 });
  });

  it("of simultaneous deliveries exactly one is told to process", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => claimEvent(testDb(), evt)));
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
  });

  it("markEvent keeps only a short error message", async () => {
    await claimEvent(testDb(), evt, 1000);
    await markEvent(testDb(), "evt_1", "failed", { error: "x".repeat(1000) }, 2000);
    expect(((await logDoc("evt_1"))?.error as string).length).toBe(300);
  });
});

describe("webhook with the event log (BILLING_FULFIL_V2=1)", () => {
  const completed = (eventId: string, sessionId = "cs_e1", over = {}) =>
    eventFixture(
      "checkout.session.completed",
      sessionFixture("paid", { id: sessionId, metadata: { uid: "u1", planId: "m", interval: "monthly" }, ...over }),
      eventId,
    );
  const deliver = (event: unknown) => webhook(new NextRequest(signedWebhookRequest(event)));

  it("replaying the same event id is a no-op, and the event is visible in the collection", async () => {
    await seedUser("u1");
    const event = completed("evt_a");
    expect((await deliver(event)).status).toBe(200);
    const first = (await user()).subscriptionExpiresAt;
    const spy = vi.spyOn(fulfilModule, "fulfilCheckoutSession");

    expect((await deliver(event)).status).toBe(200);
    expect(spy).not.toHaveBeenCalled(); // skipped before reaching fulfilment
    expect((await user()).subscriptionExpiresAt).toBe(first);
    expect(await logDoc("evt_a")).toMatchObject({
      status: "processed",
      type: "checkout.session.completed",
      sessionId: "cs_e1",
      uid: "u1",
      outcome: "fulfilled",
      livemode: false,
    });
  });

  it("concurrent deliveries of one event grant once; the loser is told to retry or sees a duplicate", async () => {
    await seedUser("u1");
    const event = completed("evt_race", "cs_race2");
    const statuses = (await Promise.all([deliver(event), deliver(event), deliver(event)])).map((r) => r.status);
    expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);
    expect(statuses).toContain(200);
    const exp = (await user()).subscriptionExpiresAt;
    expect(exp).toBeLessThan(Date.now() + MONTH_MS + 5000);
    // Stripe's retry of a 409 finds the event processed.
    expect((await deliver(event)).status).toBe(200);
    expect((await user()).subscriptionExpiresAt).toBe(exp);
  });

  it("a handler failure is logged as failed, answers 500, and the retry succeeds", async () => {
    await seedUser("u1");
    const spy = vi.spyOn(fulfilModule, "fulfilCheckoutSession").mockRejectedValueOnce(new Error("firestore hiccup"));
    const event = completed("evt_retry", "cs_retry");
    expect((await deliver(event)).status).toBe(500);
    expect(await logDoc("evt_retry")).toMatchObject({ status: "failed", error: "firestore hiccup", attempts: 1 });

    expect((await deliver(event)).status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await logDoc("evt_retry")).toMatchObject({ status: "processed", attempts: 2, error: null });
    expect((await user()).subscriptionExpiresAt).toBeGreaterThan(Date.now());
  });

  it("event types without a handler are recorded as ignored", async () => {
    expect((await deliver(eventFixture("customer.created", { id: "cus_1" }, "evt_other"))).status).toBe(200);
    expect(await logDoc("evt_other")).toMatchObject({ status: "ignored", type: "customer.created" });
  });

  it("an unmatched payment: failed + 500 inside 24 h (Stripe retries), needs_review + 200 after", async () => {
    const orphan = (id: string, created: number) => ({
      ...completed(id, "cs_" + id, { metadata: {}, customer_email: "nobody@example.com" }),
      created,
    });
    const now = Math.floor(Date.now() / 1000);
    expect((await deliver(orphan("evt_new", now - 3600))).status).toBe(500);
    expect(await logDoc("evt_new")).toMatchObject({ status: "failed", error: "unmatched payment" });

    expect((await deliver(orphan("evt_old", now - 2 * 86400))).status).toBe(200);
    expect(await logDoc("evt_old")).toMatchObject({ status: "needs_review", sessionId: "cs_evt_old" });
  });

  it("with the flag off nothing is written to stripe_events", async () => {
    vi.stubEnv("BILLING_FULFIL_V2", "0");
    await seedUser("u1");
    await deliver(completed("evt_off"));
    expect(await logDoc("evt_off")).toBeUndefined();
  });
});
