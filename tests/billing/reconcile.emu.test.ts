/** S2-04: hourly reconciliation of paid Stripe sessions the webhook missed. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testDb } from "../helpers/db";
import { seedPayment, seedUser } from "../helpers/seed";
import { sessionFixture } from "../helpers/stripe";
import { createLogger } from "@/lib/server/log";
import { MONTH_MS } from "@/lib/server/billing/access";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail }));

const { reconcilePayments, RECONCILE_WINDOW_MS } = await import("@/lib/server/billing/reconcile");
const { GET: cron } = await import("@/app/api/cron/reconcile-payments/route");
const { getStripe } = await import("@/lib/server/billing/stripe");

const NOW = Date.UTC(2026, 10, 25, 12);
const paid = (id: string, over: Record<string, unknown> = {}) =>
  sessionFixture("paid", { id, metadata: { uid: "u1", planId: "m", interval: "monthly" }, ...over });
const list = vi.fn();
const stripe = { checkout: { sessions: { list } } } as never;
const run = (now = NOW) => reconcilePayments({ db: testDb(), stripe, log: createLogger(), now: () => now });
const user = (uid = "u1") => testDb().collection("users").doc(uid).get().then((s) => s.data()!);
const payment = (id: string) => testDb().collection("payments").doc(id).get().then((s) => s.data());
const page = (...sessions: unknown[]) => list.mockResolvedValueOnce({ data: sessions, has_more: false });

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  list.mockReset();
  sendEmail.mockReset().mockResolvedValue(true);
  vi.stubEnv("ADMIN_ALERT_EMAIL", "ops@example.com");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

describe("reconcilePayments", () => {
  it("heals a paid session whose webhook never arrived, and the next run is clean", async () => {
    await seedUser("u1");
    page(paid("cs_dropped"));
    const first = await run();
    expect(first).toMatchObject({ checked: 1, healed: 1, alreadyFulfilled: 0, streak: 1 });
    expect((await user()).subscriptionExpiresAt).toBe(NOW + MONTH_MS);
    expect(await payment("cs_dropped")).toMatchObject({ status: "fulfilled", fulfilledBy: "reconcile" });

    page(paid("cs_dropped"));
    expect(await run(NOW + 3_600_000)).toMatchObject({ checked: 1, healed: 0, alreadyFulfilled: 1, streak: 0 });
    expect((await user()).subscriptionExpiresAt).toBe(NOW + MONTH_MS); // nothing granted twice
  });

  it("asks Stripe only for the last 48 hours and follows pagination", async () => {
    await seedUser("u1");
    list
      .mockResolvedValueOnce({ data: [paid("cs_1")], has_more: true })
      .mockResolvedValueOnce({ data: [paid("cs_2")], has_more: false });
    const s = await run();
    expect(s.healed).toBe(2);
    expect(list.mock.calls[0][0]).toMatchObject({ created: { gte: Math.floor((NOW - RECONCILE_WINDOW_MS) / 1000) }, limit: 100 });
    expect(list.mock.calls[1][0]).toMatchObject({ starting_after: "cs_1" });
  });

  it("leaves alone sessions that are fulfilled, unpaid, not complete, or not from this app", async () => {
    await seedUser("u1");
    await seedPayment("cs_done", { uid: "u1" });
    page(
      paid("cs_done"),
      sessionFixture("async_pending", { id: "cs_pending", metadata: { uid: "u1" } }),
      paid("cs_open", { status: "open" }),
      paid("cs_expired", { status: "expired" }),
      paid("cs_foreign", { metadata: {} }),
    );
    expect(await run()).toMatchObject({ checked: 1, alreadyFulfilled: 1, pending: 1, skippedForeign: 1, healed: 0, streak: 0 });
    expect((await user()).subscriptionExpiresAt).toBeUndefined();
  });

  it("counts unmatched and failing sessions and keeps going with the rest", async () => {
    await seedUser("u1");
    const fulfil = await import("@/lib/server/billing/fulfil");
    const real = fulfil.fulfilCheckoutSession;
    const spy = vi.spyOn(fulfil, "fulfilCheckoutSession").mockImplementation(async (s, o) => {
      const id = (s as { id: string }).id;
      if (id === "cs_ghost") throw new fulfil.UnmatchedPayment(id);
      if (id === "cs_err") throw new Error("boom");
      return real(s, o);
    });
    page(paid("cs_ghost"), paid("cs_err"), paid("cs_good"));
    expect(await run()).toMatchObject({ checked: 3, healed: 1, unmatched: 1, errors: 1, streak: 1 });
    expect(await payment("cs_good")).toMatchObject({ fulfilledBy: "reconcile" });
    expect(await payment("cs_ghost")).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(3);
  });
});

describe("repeated healing alerts the operator once", () => {
  const badRun = async (i: number) => {
    page(paid(`cs_bad_${i}`));
    return run(NOW + i * 3_600_000);
  };

  it("one heal is tolerated; consecutive runs that heal alert exactly once; a clean run resets", async () => {
    await seedUser("u1");
    expect((await badRun(1)).alerted).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();

    const second = await badRun(2);
    expect(second).toMatchObject({ streak: 2, alerted: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0] as { to: string; subject: string; text: string };
    expect(mail.to).toBe("ops@example.com");
    expect(mail.subject).toContain("2 runs in a row");
    expect(mail.text).toContain("webhook");

    await badRun(3);
    await badRun(4);
    expect(sendEmail).toHaveBeenCalledTimes(1); // still the same streak

    page(); // clean run
    expect(await run(NOW + 5 * 3_600_000)).toMatchObject({ streak: 0, alerted: false });
    await badRun(6);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    await badRun(7);
    expect(sendEmail).toHaveBeenCalledTimes(2); // a new streak alerts again
  });

  it("a clean run in between means no alert", async () => {
    await seedUser("u1");
    await badRun(1);
    page();
    await run(NOW + 2 * 3_600_000);
    await badRun(3);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a failing mail provider does not break the run and the alert is retried next time", async () => {
    await seedUser("u1");
    sendEmail.mockResolvedValue(false);
    await badRun(1);
    expect((await badRun(2)).alerted).toBe(false);
    sendEmail.mockResolvedValue(true);
    expect((await badRun(3)).alerted).toBe(true);
  });
});

describe("GET /api/cron/reconcile-payments", () => {
  const call = (auth?: string) =>
    cron(new NextRequest("http://localhost/api/cron/reconcile-payments", { headers: auth ? { authorization: auth } : {} }));

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "s3cr3t-value");
    vi.stubEnv("BILLING_FULFIL_V2", "1");
  });

  it("fails closed when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(500);
  });

  it("refuses a missing, wrong or differently-sized secret", async () => {
    for (const auth of [undefined, "Bearer nope", "Bearer s3cr3t-valuX", "s3cr3t-value", "Bearer s3cr3t-value-and-more"]) {
      expect((await call(auth)).status, String(auth)).toBe(401);
    }
  });

  it("does nothing while BILLING_FULFIL_V2 is off", async () => {
    vi.stubEnv("BILLING_FULFIL_V2", "0");
    const spy = vi.spyOn(getStripe().checkout.sessions, "list");
    const res = await call("Bearer s3cr3t-value");
    expect(await res.json()).toEqual({ skipped: "BILLING_FULFIL_V2 is off" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("runs with the right secret and returns the summary", async () => {
    await seedUser("u1");
    vi.spyOn(getStripe().checkout.sessions, "list").mockResolvedValue({ data: [paid("cs_route")], has_more: false } as never);
    const res = await call("Bearer s3cr3t-value");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ checked: 1, healed: 1, windowHours: 48 });
    expect((await user()).subscriptionExpiresAt).toBeGreaterThan(Date.now());
  });

  it("answers 500 when Stripe is misconfigured", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect((await call("Bearer s3cr3t-value")).status).toBe(500);
  });
});
