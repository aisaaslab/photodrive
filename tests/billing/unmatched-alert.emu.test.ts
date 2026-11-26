/** S2-03: unmatched-payment policy, better user resolution, and the operator alert that fires once. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testDb } from "../helpers/db";
import { seedUser } from "../helpers/seed";
import { TEST_WEBHOOK_SECRET, chargeFixture, eventFixture, sessionFixture, signedWebhookRequest } from "../helpers/stripe";
import { createLogger } from "@/lib/server/log";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
const sendEmail = vi.fn();
vi.mock("@/lib/email", async (orig) => ({ ...(await orig<typeof import("@/lib/email")>()), sendEmail }));
// Customers get their own e-mails too (S2-14); these tests are about the OPERATOR alert, so only count mail to the operator.
const adminCalls = () => sendEmail.mock.calls.filter((c) => (c[0] as { to: string }).to === "ops@example.com");

const { POST: webhook } = await import("@/app/api/stripe/webhook/route");
const { handleStripeEvent } = await import("@/lib/server/billing/events/dispatch");
const { fulfilCheckoutSession, UnmatchedPayment } = await import("@/lib/server/billing/fulfil");
const { getStripe } = await import("@/lib/server/billing/stripe");

const HOUR = 3600;
const nowSec = () => Math.floor(Date.now() / 1000);
const deliver = (event: unknown) => webhook(new NextRequest(signedWebhookRequest(event)));
const logDoc = (id: string) => testDb().collection("stripe_events").doc(id).get().then((s) => s.data()!);
const orphan = (eventId: string, ageHours: number) => ({
  ...eventFixture(
    "checkout.session.completed",
    sessionFixture("paid", { id: `cs_${eventId}`, metadata: {}, customer: null, customer_email: "secret.buyer@example.com" }),
    eventId,
  ),
  created: nowSec() - ageHours * HOUR,
});

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sendEmail.mockReset().mockResolvedValue(true);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);
  vi.stubEnv("BILLING_FULFIL_V2", "1");
  vi.stubEnv("ADMIN_ALERT_EMAIL", "ops@example.com");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

describe("unmatched payment policy", () => {
  it("inside 24 h: 500 so Stripe retries, recorded as failed, no alert", async () => {
    expect((await deliver(orphan("evt_young", 2))).status).toBe(500);
    expect(await logDoc("evt_young")).toMatchObject({ status: "failed", error: "unmatched payment" });
    expect(adminCalls()).toHaveLength(0);
  });

  it("after 24 h: 200, needs_review, and exactly one alert that leaks no customer e-mail", async () => {
    expect((await deliver(orphan("evt_old", 30))).status).toBe(200);
    const doc = await logDoc("evt_old");
    expect(doc).toMatchObject({ status: "needs_review", outcome: "unmatched_payment", sessionId: "cs_evt_old" });
    expect(doc.alertedAt).toBeGreaterThan(0);

    expect(adminCalls()).toHaveLength(1);
    const mail = adminCalls()[0][0] as { to: string; subject: string; text: string; html: string };
    expect(mail.to).toBe("ops@example.com");
    expect(mail.subject).toContain("unmatched_payment");
    expect(mail.text).toContain("evt_old");
    expect(mail.text).toContain("cs_evt_old");
    expect(mail.text).toContain("https://dashboard.stripe.com/test/events/evt_old");
    expect(mail.text + mail.html).not.toContain("secret.buyer@example.com");
  });

  it("a redelivery of the same event sends no second alert", async () => {
    const event = orphan("evt_dup", 30);
    await deliver(event);
    await deliver(event);
    await deliver(event);
    expect(adminCalls()).toHaveLength(1);
  });

  it("retries inside the window never alert; the first attempt past 24 h alerts once", async () => {
    const event = orphan("evt_timeline", 0) as ReturnType<typeof orphan> & { created: number };
    const t0 = event.created * 1000;
    const log = createLogger();
    const at = (hours: number) => () => t0 + hours * HOUR * 1000;
    expect((await handleStripeEvent(event as never, log, at(1))).status).toBe(500);
    expect((await handleStripeEvent(event as never, log, at(12))).status).toBe(500);
    expect(adminCalls()).toHaveLength(0);
    expect((await handleStripeEvent(event as never, log, at(25))).status).toBe(200);
    expect(adminCalls()).toHaveLength(1);
    expect(await logDoc("evt_timeline")).toMatchObject({ status: "needs_review", attempts: 3 });
    await handleStripeEvent(event as never, log, at(26));
    expect(adminCalls()).toHaveLength(1);
  });

  it("a failing mail provider (false or exception) never changes the response and leaves alertedAt unset", async () => {
    sendEmail.mockResolvedValueOnce(false);
    expect((await deliver(orphan("evt_mailfail", 30))).status).toBe(200);
    expect((await logDoc("evt_mailfail")).alertedAt).toBeUndefined();
    sendEmail.mockRejectedValueOnce(new Error("smtp down"));
    expect((await deliver(orphan("evt_mailthrow", 30))).status).toBe(200);
    expect(await logDoc("evt_mailthrow")).toMatchObject({ status: "needs_review" });
  });

  it("without ADMIN_ALERT_EMAIL nothing is sent but the event is still recorded", async () => {
    vi.stubEnv("ADMIN_ALERT_EMAIL", "");
    expect((await deliver(orphan("evt_nomail", 30))).status).toBe(200);
    expect(adminCalls()).toHaveLength(0);
    expect(await logDoc("evt_nomail")).toMatchObject({ status: "needs_review" });
  });
});

describe("which events alert the operator", () => {
  const buy = async () =>
    deliver(
      eventFixture("checkout.session.completed", sessionFixture("paid", { id: "cs_ok", metadata: { uid: "u1", planId: "m", interval: "monthly" }, payment_intent: "pi_ok" }), "evt_buy"),
    );

  it("a normal purchase, an ignored event and a clean full refund do not", async () => {
    await seedUser("u1");
    await buy();
    await deliver(eventFixture("customer.created", {}, "evt_ignored"));
    await deliver(eventFixture("charge.refunded", chargeFixture({ payment_intent: "pi_ok" }), "evt_refund"));
    expect(adminCalls()).toHaveLength(0);
  });

  it("a partial refund and a refund for an unknown payment do, once each", async () => {
    await seedUser("u1");
    await buy();
    vi.spyOn(getStripe().checkout.sessions, "list").mockResolvedValue({ data: [] } as never);
    await deliver(eventFixture("charge.refunded", chargeFixture({ payment_intent: "pi_ok", amount_refunded: 1000, refunded: false }), "evt_partial"));
    await deliver(eventFixture("charge.refunded", chargeFixture({ payment_intent: "pi_nope" }), "evt_orphan_refund"));
    expect(adminCalls()).toHaveLength(2);
    const subjects = adminCalls().map((c) => (c[0] as { subject: string }).subject);
    expect(subjects[0]).toContain("refund_partial_flagged");
    expect(subjects[1]).toContain("payment_not_found");
  });
});

describe("user resolution", () => {
  const session = (over: Record<string, unknown> = {}) =>
    sessionFixture("paid", { id: "cs_r", metadata: {}, customer: "cus_known", customer_email: null, ...over });
  const fulfil = (s: unknown) => fulfilCheckoutSession(s as never, { source: "webhook" });

  it("finds the user by the Stripe customer id stored on their document", async () => {
    await seedUser("u1", { stripeCustomerId: "cus_known" });
    expect(await fulfil(session())).toMatchObject({ state: "fulfilled", uid: "u1" });
  });

  it("metadata.uid and client_reference_id take precedence over the customer id", async () => {
    await seedUser("u1", { stripeCustomerId: "cus_known" });
    await seedUser("u2");
    expect(await fulfil(session({ metadata: { uid: "u2" } }))).toMatchObject({ uid: "u2" });
    expect(await fulfil(session({ id: "cs_r2", client_reference_id: "u2" }))).toMatchObject({ uid: "u2" });
  });

  it("never guesses when a customer id belongs to several users", async () => {
    await seedUser("u1", { stripeCustomerId: "cus_known" });
    await seedUser("u2", { stripeCustomerId: "cus_known" });
    await expect(fulfil(session())).rejects.toBeInstanceOf(UnmatchedPayment);
  });

  it("falls back to the e-mail address, and is unresolved when nothing matches", async () => {
    await seedUser("u3", {}, "buyer@example.com");
    expect(await fulfil(session({ id: "cs_m", customer: "cus_other", customer_email: "buyer@example.com" }))).toMatchObject({ uid: "u3" });
    await expect(fulfil(session({ id: "cs_n", customer: "cus_unrelated" }))).rejects.toBeInstanceOf(UnmatchedPayment);
  });
});
