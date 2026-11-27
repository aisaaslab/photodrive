/** S2-06: back-fill reports against the emulator. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearEmulators, testDb } from "../helpers/db";
import { seedPayment, seedUser } from "../helpers/seed";
import { sessionFixture } from "../helpers/stripe";
import { DAY_MS, LIFETIME_SENTINEL, MONTH_MS, YEAR_MS } from "@/lib/shared/billing-access";
import {
  REPORT_A_COLUMNS, REPORT_B_COLUMNS, REPORT_WINDOW_MS, buildReportA, buildReportB, toCsv,
} from "@/lib/server/billing/backfill";

const NOW = Date.UTC(2026, 10, 25, 12);
const T0 = NOW - 200 * DAY_MS;
const at = (days: number) => T0 + days * DAY_MS;

const pay = (sessionId: string, uid: string, activatedDays: number, over: Record<string, unknown> = {}) =>
  seedPayment(sessionId, { uid, sessionId, interval: "monthly", activatedAt: at(activatedDays), ...over });
const reportA = (adminUid?: string) => buildReportA(testDb(), { now: NOW, adminUid });

/** Everything in the collections the reports read, to prove they change nothing. */
async function snapshot() {
  const out: Record<string, unknown> = {};
  for (const c of ["users", "payments", "stripe_events", "system_state", "plans"]) {
    out[c] = (await testDb().collection(c).get()).docs.map((d) => [d.id, d.data()]).sort();
  }
  return JSON.stringify(out);
}

beforeEach(clearEmulators);

describe("Report A", () => {
  it("lists under-extended customers (PAY-2) and leaves correct accounts out", async () => {
    // matches: yearly paid once, expiry = payment + year
    await seedUser("ok", { subscriptionExpiresAt: at(0) + YEAR_MS, email: "ok@example.com" });
    await pay("cs_ok", "ok", 0, { interval: "yearly" });
    // PAY-2: second monthly payment while active added nothing
    await seedUser("pay2", { subscriptionExpiresAt: at(0) + MONTH_MS, email: "pay2@example.com", planName: "Monthly" });
    await pay("cs_p2a", "pay2", 0);
    await pay("cs_p2b", "pay2", 10);
    // renewal after a lapse works today
    await seedUser("renewed", { subscriptionExpiresAt: at(100) + MONTH_MS });
    await pay("cs_r1", "renewed", 0);
    await pay("cs_r2", "renewed", 100);

    const { rows, summary } = await reportA();
    expect(summary).toMatchObject({ usersWithPayments: 3, matched: 2, underExtended: 1, overExtended: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      uid: "pay2",
      email: "pay2@example.com",
      paymentsReplayed: 2,
      category: "under_extended",
      deltaDays: 30,
      plan: "Monthly",
      expectedExpiry: new Date(at(0) + 2 * MONTH_MS).toISOString(),
      currentExpiry: new Date(at(0) + MONTH_MS).toISOString(),
    });
    expect(rows[0].bothExpired).toBe(true);
  });

  it("ignores differences of a day or less", async () => {
    await seedUser("close", { subscriptionExpiresAt: at(0) + MONTH_MS - DAY_MS });
    await pay("cs_c", "close", 0);
    expect((await reportA()).summary).toMatchObject({ matched: 1, underExtended: 0 });
  });

  it("reports accounts with MORE time than their payments explain, for review only", async () => {
    await seedUser("extra", { subscriptionExpiresAt: at(0) + MONTH_MS + 60 * DAY_MS });
    await pay("cs_e", "extra", 0);
    const { rows, summary } = await reportA();
    expect(summary.overExtended).toBe(1);
    expect(rows[0]).toMatchObject({ category: "over_extended", deltaDays: -60 });
    expect(rows[0].note).toContain("never reduced");
  });

  it("skips comped, lifetime and admin accounts, and counts payments of deleted users", async () => {
    await seedUser("comp", { subscriptionExpiresAt: at(0) + 5 * YEAR_MS, compGranted: true });
    await pay("cs_comp", "comp", 0);
    await seedUser("life", { subscriptionExpiresAt: LIFETIME_SENTINEL });
    await pay("cs_life", "life", 0);
    await seedUser("boss", { subscriptionExpiresAt: 1 });
    await pay("cs_boss", "boss", 0);
    await pay("cs_gone", "deleted-user", 0);
    const { rows, summary } = await reportA("boss");
    expect(rows).toHaveLength(0);
    expect(summary).toMatchObject({ skippedComp: 2, skippedAdmin: 1, orphanPayments: 1 });
  });

  it("does not count refunded or disputed payments, and replays legacy and free-code payments", async () => {
    // refunded payment revoked by S2-02: account empty, nothing expected
    await seedUser("refunded", {});
    await pay("cs_ref", "refunded", 0, { status: "refunded" });
    // legacy yearly payment with no grantedMs/status, free code with accessDays
    await seedUser("legacy", { subscriptionExpiresAt: at(0) });
    await pay("cs_leg", "legacy", 0, { interval: "yearly" });
    await seedUser("free", { subscriptionExpiresAt: at(0) + 7 * DAY_MS });
    await pay("cs_free", "free", 0, { accessDays: 7, source: "free_code" });
    const { rows, summary } = await reportA();
    expect(summary).toMatchObject({ matched: 2, underExtended: 1 });
    expect(rows.map((r) => r.uid)).toEqual(["legacy"]);
    expect(rows[0].deltaDays).toBe(365);
  });

  it("puts customers who should have access today but do not first", async () => {
    // A: expected still running, currently expired -> most urgent
    await seedUser("urgent", { subscriptionExpiresAt: at(190) });
    await pay("cs_u1", "urgent", 190, { interval: "yearly", grantedMs: 15 * DAY_MS }); // expected at(205)>NOW? at(190)+15d=at(205)
    await pay("cs_u2", "urgent", 192, { interval: "yearly", grantedMs: 20 * DAY_MS });
    // B: both long expired, bigger gap
    await seedUser("old", { subscriptionExpiresAt: at(0) + MONTH_MS });
    await pay("cs_o1", "old", 0);
    await pay("cs_o2", "old", 5);
    await pay("cs_o3", "old", 8);
    const { rows } = await reportA();
    expect(rows.map((r) => r.uid)).toEqual(["urgent", "old"]);
  });

  it("is read-only", async () => {
    await seedUser("pay2", { subscriptionExpiresAt: at(0) + MONTH_MS });
    await pay("cs_a", "pay2", 0);
    await pay("cs_b", "pay2", 10);
    const before = await snapshot();
    await reportA();
    expect(await snapshot()).toBe(before);
  });

  it("produces a CSV with the documented columns", async () => {
    await seedUser("pay2", { subscriptionExpiresAt: at(0) + MONTH_MS, email: "a,b@example.com" });
    await pay("cs_a", "pay2", 0);
    await pay("cs_b", "pay2", 10);
    const csv = toCsv((await reportA()).rows, REPORT_A_COLUMNS);
    expect(csv.split("\n")[0]).toBe("uid,email,paymentsReplayed,expectedExpiry,currentExpiry,deltaDays,plan,category,bothExpired,note");
    expect(csv).toContain('"a,b@example.com"');
  });
});

describe("Report B", () => {
  const list = vi.fn();
  const stripe = { checkout: { sessions: { list } } } as never;
  const paid = (id: string, over: Record<string, unknown> = {}) =>
    sessionFixture("paid", { id, metadata: { uid: "u1", planId: "m", interval: "monthly" }, payment_intent: `pi_${id}`, created: Math.floor(NOW / 1000) - 3600, livemode: false, ...over });
  const reportB = () => buildReportB(testDb(), stripe, { now: NOW });

  beforeEach(() => list.mockReset());

  it("lists paid sessions that have no payments document, oldest first", async () => {
    await seedPayment("cs_known", { uid: "u1" });
    list.mockResolvedValueOnce({
      data: [
        paid("cs_known"),
        paid("cs_new", { created: Math.floor(NOW / 1000) - 100, customer_email: "new@example.com", amount_total: 900 }),
        paid("cs_missing", { customer_email: "buyer@example.com", amount_total: 9900, currency: "usd" }),
      ],
      has_more: false,
    });
    const { rows, summary } = await reportB();
    expect(summary).toMatchObject({ sessionsSeen: 3, paidSessions: 3, missing: 2 });
    expect(rows.map((r) => r.sessionId)).toEqual(["cs_missing", "cs_new"]);
    expect(rows[0]).toMatchObject({
      uid: "u1", email: "buyer@example.com", amount: 9900, currency: "USD", paymentIntent: "pi_cs_missing", planId: "m", interval: "monthly", livemode: false,
    });
  });

  it("ignores unpaid, incomplete and foreign sessions", async () => {
    list.mockResolvedValueOnce({
      data: [
        sessionFixture("async_pending", { id: "cs_unpaid", metadata: { uid: "u1" } }),
        paid("cs_open", { status: "open" }),
        paid("cs_expired", { status: "expired" }),
        paid("cs_foreign", { metadata: {} }),
        paid("cs_free", { payment_status: "no_payment_required", amount_total: 0 }),
      ],
      has_more: false,
    });
    const { rows, summary } = await reportB();
    expect(summary).toMatchObject({ sessionsSeen: 5, paidSessions: 1, skippedForeign: 1, missing: 1 });
    expect(rows.map((r) => r.sessionId)).toEqual(["cs_free"]);
  });

  it("asks for the last 13 months and follows pagination", async () => {
    list
      .mockResolvedValueOnce({ data: [paid("cs_1")], has_more: true })
      .mockResolvedValueOnce({ data: [paid("cs_2")], has_more: false });
    expect((await reportB()).summary.missing).toBe(2);
    expect(list.mock.calls[0][0]).toMatchObject({ created: { gte: Math.floor((NOW - REPORT_WINDOW_MS) / 1000) }, limit: 100 });
    expect(list.mock.calls[1][0]).toMatchObject({ starting_after: "cs_1" });
  });

  it("is read-only and produces a CSV with the documented columns", async () => {
    await seedUser("u1");
    list.mockResolvedValueOnce({ data: [paid("cs_x", { customer_email: "=cmd@example.com" })], has_more: false });
    const before = await snapshot();
    const { rows } = await reportB();
    expect(await snapshot()).toBe(before);
    const csv = toCsv(rows, REPORT_B_COLUMNS);
    expect(csv.split("\n")[0]).toBe("sessionId,created,uid,email,amount,currency,paymentIntent,planId,interval,livemode,note");
    expect(csv).toContain("'=cmd@example.com"); // formula defused
  });
});
