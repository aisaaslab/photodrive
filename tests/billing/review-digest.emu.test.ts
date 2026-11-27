/** S2-16: the daily digest of payment items that need a human look, and marking them reviewed. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedPayment, seedUser } from "../helpers/seed";
import { createLogger } from "@/lib/server/log";
import { DIGEST_MIN_GAP_MS, listOpenReviewItems, markReviewed, sendReviewDigest } from "@/lib/server/billing/review";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
const sendEmail = vi.hoisted(() => vi.fn()); // hoisted: review.ts (imported above) loads the mocked e-mail module first
vi.mock("@/lib/email", async (orig) => ({ ...(await orig<typeof import("@/lib/email")>()), sendEmail }));

const { GET: cron } = await import("@/app/api/cron/review-digest/route");
const { POST: reviewApi } = await import("@/app/api/admin/review/route");

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 26, 8);
const log = createLogger({ scope: "t" });
const digest = (now = NOW) => sendReviewDigest(testDb(), log, { now });
const mails = () => sendEmail.mock.calls.map((c) => c[0] as { to: string; subject: string; text: string });
const event = (id: string, over: Record<string, unknown> = {}) =>
  testDb().collection("stripe_events").doc(id).set({ type: "charge.refunded", status: "needs_review", outcome: "refund_partial_flagged", receivedAt: NOW - 3 * DAY, ...over });

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sendEmail.mockReset().mockResolvedValue(true);
  vi.stubEnv("ADMIN_ALERT_EMAIL", "ops@example.com");
  vi.stubEnv("CRON_SECRET", "cron-secret-value");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

describe("listOpenReviewItems", () => {
  it("lists events that need review and payments flagged for review, oldest first, and nothing else", async () => {
    await event("evt_new", { receivedAt: NOW - DAY });
    await event("evt_old", { receivedAt: NOW - 9 * DAY, outcome: "unmatched_payment", sessionId: "cs_1" });
    await event("evt_ok", { status: "processed" });
    await event("evt_done", { resolvedAt: NOW - 1 });
    await seedPayment("cs_disputed", { uid: "u1", status: "disputed", needsReview: true, activatedAt: 5, reviewNote: "Dispute open" });
    await seedPayment("cs_fine", { uid: "u1", status: "fulfilled", activatedAt: 6 });
    await seedPayment("cs_refunded_ok", { uid: "u1", status: "refunded", needsReview: false, activatedAt: 7 });

    const { events, payments } = await listOpenReviewItems(testDb());
    expect(events.map((e) => e.id)).toEqual(["evt_old", "evt_new"]);
    expect(events[0]).toMatchObject({ outcome: "unmatched_payment", sessionId: "cs_1" });
    expect(payments.map((p) => p.id)).toEqual(["cs_disputed"]);
  });
});

describe("markReviewed", () => {
  it("resolves an event (who, when, note) and clears a payment's flag", async () => {
    await event("evt_1");
    await seedPayment("cs_1", { uid: "u1", status: "disputed", needsReview: true });
    expect(await markReviewed(testDb(), { kind: "event", id: "evt_1", by: "boss", note: "Matched by hand", now: 123 })).toBe("reviewed");
    expect(await markReviewed(testDb(), { kind: "payment", id: "cs_1", by: "boss", now: 456 })).toBe("reviewed");
    expect((await testDb().collection("stripe_events").doc("evt_1").get()).data()).toMatchObject({ resolvedAt: 123, resolvedBy: "boss", resolutionNote: "Matched by hand", status: "needs_review" });
    expect((await testDb().collection("payments").doc("cs_1").get()).data()).toMatchObject({ needsReview: false, reviewedBy: "boss", reviewedAt: 456, status: "disputed" });
    expect(await listOpenReviewItems(testDb())).toEqual({ events: [], payments: [] });
  });

  it("is safe to repeat and to get wrong", async () => {
    await event("evt_1");
    await markReviewed(testDb(), { kind: "event", id: "evt_1", by: "boss" });
    expect(await markReviewed(testDb(), { kind: "event", id: "evt_1", by: "boss" })).toBe("not_open");
    expect(await markReviewed(testDb(), { kind: "event", id: "nope", by: "boss" })).toBe("not_found");
    expect(await markReviewed(testDb(), { kind: "payment", id: "nope", by: "boss" })).toBe("not_found");
    await seedPayment("cs_fine", { uid: "u1", status: "fulfilled" });
    expect(await markReviewed(testDb(), { kind: "payment", id: "cs_fine", by: "boss" })).toBe("not_open");
  });
});

describe("the daily digest", () => {
  it("sends nothing when there is nothing to report", async () => {
    expect(await digest()).toBe("nothing_to_report");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("e-mails the operator one summary of what is open, oldest first, with ages and no customer e-mail addresses", async () => {
    await seedUser("u1", { email: "customer.secret@example.com" });
    await event("evt_old", { receivedAt: NOW - 9 * DAY, outcome: "unmatched_payment", sessionId: "cs_abc", uid: "u1" });
    await event("evt_new", { receivedAt: NOW - DAY });
    await seedPayment("cs_dis", { uid: "u1", status: "disputed", needsReview: true, activatedAt: NOW - 4 * DAY, reviewNote: "Dispute open" });

    expect(await digest()).toBe("sent");
    expect(mails()).toHaveLength(1);
    const m = mails()[0];
    expect(m.to).toBe("ops@example.com");
    expect(m.subject).toBe("[PhotoDrive] 3 payment items need review");
    expect(m.text).toContain("3 payment items still need a human look (2 Stripe events, 1 payment)");
    expect(m.text.indexOf("evt_old")).toBeLessThan(m.text.indexOf("evt_new"));
    expect(m.text).toContain("evt_old: unmatched_payment (charge.refunded), 9 day(s) old, session cs_abc");
    expect(m.text).toContain("Payment cs_dis: disputed, Dispute open, 4 day(s) old");
    expect(m.text).toContain("/dashboard/admin/users");
    expect(m.text).not.toContain("customer.secret@example.com");
  });

  it("sends at most one a day, and again once the gap has passed", async () => {
    await event("evt_1");
    expect(await digest()).toBe("sent");
    expect(await digest(NOW + 60_000)).toBe("skipped_recent");
    expect(await digest(NOW + DIGEST_MIN_GAP_MS - 1)).toBe("skipped_recent");
    expect(await digest(NOW + DIGEST_MIN_GAP_MS)).toBe("sent");
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("an old unresolved item appears in the next digest and not in one after it is resolved", async () => {
    await event("evt_old", { receivedAt: NOW - 20 * DAY });
    await event("evt_other");
    await digest();
    expect(mails()[0].text).toContain("evt_old");

    await markReviewed(testDb(), { kind: "event", id: "evt_old", by: "boss" });
    await digest(NOW + 2 * DAY);
    expect(mails()[1].text).not.toContain("evt_old");
    expect(mails()[1].text).toContain("evt_other");
    expect(mails()[1].subject).toBe("[PhotoDrive] 1 payment item need review");

    await markReviewed(testDb(), { kind: "event", id: "evt_other", by: "boss" });
    expect(await digest(NOW + 4 * DAY)).toBe("nothing_to_report");
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("if the mail cannot be sent it tries again on the next run, not tomorrow", async () => {
    await event("evt_1");
    sendEmail.mockResolvedValueOnce(false);
    expect(await digest()).toBe("mail_failed");
    expect(await digest(NOW + 60_000)).toBe("sent");
  });

  it("reports when no operator address is configured", async () => {
    vi.stubEnv("ADMIN_ALERT_EMAIL", "");
    await event("evt_1");
    expect(await digest()).toBe("mail_not_configured");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("lists at most 25 of each and says there are more", async () => {
    for (let i = 0; i < 30; i++) await event(`evt_${String(i).padStart(2, "0")}`, { receivedAt: NOW - (40 - i) * 1000 });
    await digest();
    const lines = mails()[0].text.split("\n").filter((l) => l.startsWith("- Event"));
    expect(lines).toHaveLength(25);
    expect(mails()[0].text).toContain("...and more");
  });
});

describe("GET /api/cron/review-digest", () => {
  const call = (auth?: string) => cron(new NextRequest("http://localhost/api/cron/review-digest", { headers: auth ? { authorization: auth } : {} }));

  it("fails closed without CRON_SECRET and refuses a wrong secret", async () => {
    expect((await call("Bearer cron-secret-value-x")).status).toBe(401);
    expect((await call()).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(500);
  });

  it("runs the digest with the right secret", async () => {
    await event("evt_1");
    const res = await call("Bearer cron-secret-value");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "sent" });
    expect(mails()).toHaveLength(1);
  });
});

describe("POST /api/admin/review", () => {
  let asUid = "boss";
  const post = (body: unknown, raw?: string) =>
    reviewApi(new NextRequest("http://localhost/api/admin/review", {
      method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: raw ?? JSON.stringify(body),
    }));

  beforeEach(() => {
    vi.stubEnv("ADMIN_UID", "boss");
    asUid = "boss";
    vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async () => ({ uid: asUid })) as never);
  });

  it("marks an item reviewed, recording who", async () => {
    await seedPayment("cs_1", { uid: "u1", status: "disputed", needsReview: true });
    expect((await post({ kind: "payment", id: "cs_1", note: "Customer contacted" })).status).toBe(200);
    expect((await testDb().collection("payments").doc("cs_1").get()).data()).toMatchObject({ needsReview: false, reviewedBy: "boss", reviewOutcomeNote: "Customer contacted" });
    expect((await post({ kind: "payment", id: "cs_1" })).status).toBe(409);
    expect((await post({ kind: "event", id: "nope" })).status).toBe(404);
  });

  it("is admin only and validates the body", async () => {
    asUid = "someone";
    expect((await post({ kind: "payment", id: "x" })).status).toBe(403);
    asUid = "boss";
    expect((await post(undefined, "{bad")).status).toBe(400);
    for (const body of [{}, { kind: "user", id: "x" }, { kind: "event" }, { kind: "event", id: "" }, { kind: "event", id: "x", note: "n".repeat(501) }]) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400);
    }
  });
});
