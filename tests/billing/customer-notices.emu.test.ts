/** S2-14: customer e-mails about refunds, disputes and failed payments, sent from the webhook. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testDb } from "../helpers/db";
import { seedUser } from "../helpers/seed";
import {
  TEST_WEBHOOK_SECRET, chargeFixture, disputeFixture, eventFixture, sessionFixture, signedWebhookRequest,
} from "../helpers/stripe";
import { DAY_MS, LIFETIME_SENTINEL } from "@/lib/server/billing/access";
import { createLogger } from "@/lib/server/log";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
const sendEmail = vi.fn();
vi.mock("@/lib/email", async (orig) => ({ ...(await orig<typeof import("@/lib/email")>()), sendEmail }));

const { POST: webhook } = await import("@/app/api/stripe/webhook/route");
const { sendCustomerNotice } = await import("@/lib/server/notify/customer");

type Mail = { to: string; subject: string; text: string; html: string; replyTo?: string };
const mails = () => sendEmail.mock.calls.map((c) => c[0] as Mail);

let n = 0;
const deliver = (type: string, object: unknown, id?: string) =>
  webhook(new NextRequest(signedWebhookRequest(eventFixture(type, object, id ?? `evt_${++n}`))));
const notices = () => testDb().collection("customer_notices").get().then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })));

async function buy(sessionId: string, paymentIntent: string, uid = "u1") {
  await deliver(
    "checkout.session.completed",
    sessionFixture("paid", { id: sessionId, metadata: { uid, planId: "m", interval: "monthly" }, payment_intent: paymentIntent }),
  );
}
const dateOf = (ms: number, locale = "en-GB") =>
  new Date(ms).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sendEmail.mockReset().mockResolvedValue(true);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);
  vi.stubEnv("BILLING_FULFIL_V2", "1");
  vi.stubEnv("ADMIN_ALERT_EMAIL", "");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

describe("refunds", () => {
  it("a full refund e-mails the customer once, in English by default, with what it means for their access", async () => {
    const original = Date.now() + 10 * DAY_MS;
    await seedUser("u1", { name: "Anna Papadopoulou", subscriptionStatus: "active", subscriptionExpiresAt: original });
    await buy("cs_a", "pi_a");
    expect(sendEmail).not.toHaveBeenCalled(); // buying sends nothing here

    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_a" }));
    expect(mails()).toHaveLength(1);
    const m = mails()[0];
    expect(m.to).toBe("u1@example.com");
    expect(m.replyTo).toBe("support@photodrive.co"); // the default support address
    expect(m.subject).toBe("Your refund has been processed");
    expect(m.text).toContain("Hi Anna,");
    expect(m.text).toContain("$99.00");
    expect(m.text).toContain(`runs until ${dateOf(original)}`); // back to what they had before the refunded month
    expect(m.text).not.toMatch(/cs_a|pi_a/); // no internal ids
    expect(await notices()).toMatchObject([{ id: "refund_full__cs_a", status: "sent", uid: "u1", language: "en", attempts: 1 }]);
  });

  it("writes to the customer in the language stored on their account", async () => {
    await seedUser("u1", { language: "el" });
    await buy("cs_g", "pi_g");
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_g" }));
    expect(mails()[0].subject).toBe("Η επιστροφή χρημάτων σου ολοκληρώθηκε");
    expect((await notices())[0]).toMatchObject({ language: "el" });
  });

  it("falls back to English when the stored language is missing or junk", async () => {
    await seedUser("u1", { language: "klingon" });
    await buy("cs_j", "pi_j");
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_j" }));
    expect(mails()[0].subject).toBe("Your refund has been processed");
  });

  it("says access has ended when the refund leaves nothing", async () => {
    await seedUser("u1");
    await buy("cs_e", "pi_e");
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_e" }));
    expect(mails()[0].text).toContain("access has ended");
  });

  it("a repeat of the same event, or a second event for the same refund, sends nothing more", async () => {
    await seedUser("u1");
    await buy("cs_r", "pi_r");
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_r" }), "evt_same");
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_r" }), "evt_same"); // redelivery
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_r" })); // new event id, nothing left to change
    expect(mails()).toHaveLength(1);
  });

  it("a partial refund says so and leaves access alone; the rest refunded later is a second message", async () => {
    const original = Date.now() + 10 * DAY_MS;
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: original });
    await buy("cs_p", "pi_p");
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_p", amount_refunded: 2000, refunded: false }));
    expect(mails()).toHaveLength(1);
    expect(mails()[0].subject).toBe("A partial refund has been processed");
    expect(mails()[0].text).toContain("$20.00");
    expect(mails()[0].text).toContain("$99.00");

    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_p" }));
    expect(mails().map((m) => m.subject)).toEqual(["A partial refund has been processed", "Your refund has been processed"]);
  });

  it("a lifetime customer is told their access is unchanged, never that it ended", async () => {
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: LIFETIME_SENTINEL });
    await buy("cs_l", "pi_l");
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_l" }));
    expect(mails()[0].text).toContain("Your access is unchanged.");
    expect(mails()[0].text).not.toContain("has ended");
  });

  it("an unknown payment sends nothing", async () => {
    await seedUser("u1");
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_nobody" }));
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("disputes", () => {
  it("opened, then won: the customer hears about the pause and the restore", async () => {
    const original = Date.now() + 10 * DAY_MS;
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: original });
    await buy("cs_d", "pi_d");
    await deliver("charge.dispute.created", disputeFixture({ payment_intent: "pi_d" }));
    await deliver("charge.dispute.closed", disputeFixture({ payment_intent: "pi_d", status: "won" }));
    expect(mails().map((m) => m.subject)).toEqual(["A dispute was opened on your payment", "Your access has been restored"]);
    expect(mails()[0].text).toContain("on hold");
    expect(mails()[1].text).toContain("restored");
    expect(mails()[1].text).toMatch(/runs until \d/);
  });

  it("lost: the customer is told the time was removed and how to subscribe again", async () => {
    await seedUser("u1");
    await buy("cs_x", "pi_x");
    await deliver("charge.dispute.created", disputeFixture({ payment_intent: "pi_x" }));
    await deliver("charge.dispute.closed", disputeFixture({ payment_intent: "pi_x", status: "lost" }));
    const last = mails().at(-1)!;
    expect(last.subject).toBe("An update on your payment dispute");
    expect(last.text).toContain("removed");
    expect(last.text).toContain("/subscribe");
  });

  it("a lost dispute with no 'opened' event seen still tells the customer once", async () => {
    await seedUser("u1");
    await buy("cs_y", "pi_y");
    await deliver("charge.dispute.closed", disputeFixture({ payment_intent: "pi_y", status: "lost" }));
    expect(mails()).toHaveLength(1);
  });
});

describe("failed payments", () => {
  const failed = (id: string, over: Record<string, unknown> = {}) =>
    sessionFixture("async_pending", { id, metadata: { uid: "u1" }, amount_total: 900, currency: "usd", ...over });

  it("an asynchronous payment that failed gets a message with where to try again", async () => {
    await seedUser("u1");
    await deliver("checkout.session.async_payment_failed", failed("cs_f"));
    expect(mails()).toHaveLength(1);
    expect(mails()[0].subject).toBe("Your payment did not go through");
    expect(mails()[0].text).toContain("$9.00");
    expect(mails()[0].text).toContain("/subscribe");
    expect(mails()[0].text).toContain("no access was added");
  });

  it("an expired (abandoned) checkout sends nothing", async () => {
    await seedUser("u1");
    await deliver("checkout.session.expired", failed("cs_exp"));
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("it never gets in the way of the webhook", () => {
  it("a mail provider failure (false or exception) still answers 200 and is recorded as failed", async () => {
    await seedUser("u1");
    await buy("cs_m1", "pi_m1");
    sendEmail.mockResolvedValueOnce(false);
    expect((await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_m1" }))).status).toBe(200);
    expect(await notices()).toMatchObject([{ id: "refund_full__cs_m1", status: "failed" }]);

    await seedUser("u2");
    await buy("cs_m2", "pi_m2", "u2");
    sendEmail.mockRejectedValueOnce(new Error("smtp down"));
    expect((await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_m2" }))).status).toBe(200);
  });

  it("a customer with no e-mail address or no account is skipped quietly", async () => {
    await testDb().collection("users").doc("noemail").set({ name: "No Email", subscriptionStatus: "active" });
    const log = createLogger({ scope: "t" });
    expect(await sendCustomerNotice(testDb(), { kind: "refund_full", refId: "x", uid: "noemail", amountMinor: 100 }, log)).toBe("skipped_no_email");
    expect(await sendCustomerNotice(testDb(), { kind: "refund_full", refId: "x", uid: "ghost", amountMinor: 100 }, log)).toBe("skipped_no_user");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(await notices()).toEqual([]);
  });

  it("nothing is sent while BILLING_FULFIL_V2 is off (the old path does not handle these events)", async () => {
    vi.stubEnv("BILLING_FULFIL_V2", "0");
    await seedUser("u1");
    await deliver("charge.refunded", chargeFixture({ payment_intent: "pi_off" }));
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("sendCustomerNotice", () => {
  const log = createLogger({ scope: "t" });
  const input = { kind: "refund_full" as const, refId: "cs_dup", uid: "u1", amountMinor: 900, currency: "usd" };

  it("sends a given message at most once even when called at the same time", async () => {
    await seedUser("u1");
    const results = await Promise.all(Array.from({ length: 6 }, () => sendCustomerNotice(testDb(), input, log)));
    expect(results.filter((r) => r === "sent")).toHaveLength(1);
    expect(results.filter((r) => r === "skipped_duplicate").length).toBeGreaterThanOrEqual(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("a message another call is sending right now is not sent again, but a stale claim (a crashed attempt) is retried", async () => {
    await seedUser("u1");
    const claim = (updatedAt: number) =>
      testDb().collection("customer_notices").doc("refund_full__cs_dup").set({ kind: "refund_full", refId: "cs_dup", uid: "u1", status: "pending", attempts: 1, updatedAt });
    const NOW = Date.UTC(2026, 10, 26);
    await claim(NOW - 30_000); // claimed 30 s ago: still sending
    expect(await sendCustomerNotice(testDb(), input, log, NOW)).toBe("skipped_duplicate");
    expect(sendEmail).not.toHaveBeenCalled();
    await claim(NOW - 5 * 60_000); // claimed 5 minutes ago: the sender must have crashed
    expect(await sendCustomerNotice(testDb(), input, log, NOW)).toBe("sent");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(await notices()).toMatchObject([{ status: "sent", attempts: 2 }]);
  });

  it("tries again after a failure, and stops once it has been sent", async () => {
    await seedUser("u1");
    sendEmail.mockResolvedValueOnce(false);
    expect(await sendCustomerNotice(testDb(), input, log)).toBe("failed");
    expect(await sendCustomerNotice(testDb(), input, log)).toBe("sent");
    expect(await sendCustomerNotice(testDb(), input, log)).toBe("skipped_duplicate");
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(await notices()).toMatchObject([{ status: "sent", attempts: 2 }]);
  });

  it("different messages about the same payment are separate", async () => {
    await seedUser("u1");
    await sendCustomerNotice(testDb(), input, log);
    await sendCustomerNotice(testDb(), { ...input, kind: "dispute_opened" }, log);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("formats the amount for the customer's language and currency", async () => {
    await seedUser("u1", { language: "de" });
    await sendCustomerNotice(testDb(), { ...input, amountMinor: 9900, currency: "eur" }, log);
    expect(mails()[0].text.replace(/ /g, " ")).toContain("99,00 €");
  });
});
