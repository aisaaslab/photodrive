/** S8-01: the admin Payments screen's API against the real Firestore emulator, with a fake Stripe client. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedPayment, seedUser } from "../helpers/seed";
import { sessionFixture } from "../helpers/stripe";
import { MONTH_MS } from "@/lib/shared/billing-access";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
const retrieve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/billing/stripe", async (orig) => ({ ...(await orig<typeof import("@/lib/server/billing/stripe")>()), getStripe: () => ({ checkout: { sessions: { retrieve } } }) }));

const list = await import("@/app/api/admin/payments/route");
const summary = await import("@/app/api/admin/payments/summary/route");
const attention = await import("@/app/api/admin/payments/attention/route");
const detail = await import("@/app/api/admin/payments/[id]/route");
const resync = await import("@/app/api/admin/payments/[id]/resync/route");
const review = await import("@/app/api/admin/review/route");

const DAY = 86_400_000;
const NOW = Date.now();
let token = "boss-token";
const authed = (url: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) =>
  new NextRequest(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
const get = (url: string) => authed(`http://localhost${url}`);
const post = (url: string, body: unknown) => authed(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const listOf = async (q = "") => (await (await list.GET(get(`/api/admin/payments${q}`))).json()) as { payments: { id: string; email: string | null; status: string }[]; nextCursor: string | null };
const ids = (r: { payments: { id: string }[] }) => r.payments.map((p) => p.id);
const audit = async () => (await testDb().collection("audit_log").get()).docs.map((d) => d.data()).sort((a, b) => a.at - b.at);
const pay = (id: string, over: Record<string, unknown> = {}) =>
  seedPayment(id, { uid: "u1", sessionId: id, amountTotal: 9900, currency: "usd", activatedAt: NOW - DAY, status: "fulfilled", source: "paid", livemode: false, ...over });

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  retrieve.mockReset();
  token = "boss-token";
  vi.stubEnv("ADMIN_UID", "boss");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async (t: string) => {
    if (t === "boss-token") return { uid: "boss" };
    if (t === "user-token") return { uid: "u1" };
    throw new Error("bad token");
  }) as never);
  await seedUser("boss");
  await seedUser("u1", { name: "Maria", subscriptionStatus: "active", subscriptionExpiresAt: NOW + 5 * DAY });
  await seedUser("u2", { name: "Nikos" });
});

describe("who may use it", () => {
  it("only administrators: a customer gets 403 and a visitor 401, on every endpoint", async () => {
    await pay("cs_test_a");
    const calls = () => [
      list.GET(get("/api/admin/payments")), summary.GET(get("/api/admin/payments/summary")), attention.GET(get("/api/admin/payments/attention")),
      detail.GET(get("/api/admin/payments/cs_test_a"), ctx("cs_test_a")), resync.POST(post("/api/admin/payments/cs_test_a/resync", {}), ctx("cs_test_a")),
    ];
    token = "user-token";
    for (const r of await Promise.all(calls())) expect(r.status).toBe(403);
    token = "nope";
    for (const r of await Promise.all(calls())) expect(r.status).toBe(401);
  });
});

describe("the list", () => {
  it("shows payments newest first with the customer's e-mail, status and a Stripe link", async () => {
    await pay("cs_test_old", { activatedAt: NOW - 5 * DAY, paymentIntentId: "pi_test_old" });
    await pay("cs_test_new", { uid: "u2", activatedAt: NOW - DAY, status: "refunded", refundedAmount: 9900 });
    const r = await (await list.GET(get("/api/admin/payments"))).json();
    expect(r.payments.map((p: { id: string }) => p.id)).toEqual(["cs_test_new", "cs_test_old"]);
    expect(r.payments[0]).toMatchObject({ email: "u2@example.com", name: "Nikos", status: "refunded", amountTotal: 9900, currency: "usd" });
    expect(r.payments[1].stripeUrl).toBe("https://dashboard.stripe.com/test/payments/pi_test_old");
    expect(r.payments[0].stripeUrl).toBe("https://dashboard.stripe.com/test/search?query=cs_test_new");
  });

  it("each filter keeps what it says; old payments without a status count as paid", async () => {
    await pay("cs_paid");
    await seedPayment("cs_old", { uid: "u1", amountTotal: 5000, currency: "usd", activatedAt: NOW - 9 * DAY }); // pre-refund-handling payment: no status
    await pay("cs_free", { source: "free_code", amountTotal: 0 });
    await pay("cs_ref", { status: "partially_refunded", refundedAmount: 1000 });
    await pay("cs_dis", { status: "disputed", needsReview: true });
    await pay("cs_lost", { status: "dispute_lost" });
    const f = async (name: string) => ids(await listOf(`?filter=${name}`)).sort();
    expect(await f("paid")).toEqual(["cs_old", "cs_paid"]);
    expect(await f("free_code")).toEqual(["cs_free"]);
    expect(await f("refunded")).toEqual(["cs_ref"]);
    expect(await f("disputed")).toEqual(["cs_dis", "cs_lost"]);
    expect(await f("needs_review")).toEqual(["cs_dis"]);
    expect((await f("all")).length).toBe(6);
  });

  it("pages with a cursor: every payment exactly once, newest first", async () => {
    for (let i = 0; i < 7; i++) await pay(`cs_p${i}`, { activatedAt: NOW - i * 1000 });
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const page = await listOf(`?limit=3${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...ids(page));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(["cs_p0", "cs_p1", "cs_p2", "cs_p3", "cs_p4", "cs_p5", "cs_p6"]);
  });

  it("a filter pages through payments that do not match it", async () => {
    for (let i = 0; i < 8; i++) await pay(`cs_ok${i}`, { activatedAt: NOW - i * 1000 });
    await pay("cs_bad_old", { status: "refunded", activatedAt: NOW - 10_000_000 });
    expect(ids(await listOf("?filter=refunded&limit=2"))).toEqual(["cs_bad_old"]);
  });

  it("searches by session id (or its start), payment id and customer e-mail (or its start)", async () => {
    await pay("cs_test_alpha1", { paymentIntentId: "pi_test_1" });
    await pay("cs_test_alpha2", { uid: "u2" });
    await pay("cs_test_beta", { uid: "u2" });
    expect(ids(await listOf("?q=cs_test_alpha")).sort()).toEqual(["cs_test_alpha1", "cs_test_alpha2"]);
    expect(ids(await listOf("?q=cs_test_beta"))).toEqual(["cs_test_beta"]);
    expect(ids(await listOf("?q=pi_test_1"))).toEqual(["cs_test_alpha1"]);
    expect(ids(await listOf("?q=u2@")).sort()).toEqual(["cs_test_alpha2", "cs_test_beta"]);
    expect(ids(await listOf("?q=U1@example")).sort()).toEqual(["cs_test_alpha1"]);
    expect(ids(await listOf("?q=nobody"))).toEqual([]);
    expect(ids(await listOf("?q=u2@&filter=refunded"))).toEqual([]);
  });

  it("refuses an unknown filter and a bad cursor", async () => {
    expect((await list.GET(get("/api/admin/payments?filter=nope"))).status).toBe(400);
    expect((await list.GET(get("/api/admin/payments?cursor=garbage"))).status).toBe(400);
  });
});

describe("totals per currency", () => {
  it("never mixes currencies, leaves free codes and older payments out, and counts refunds", async () => {
    await pay("cs_1", { amountTotal: 9900 });
    await pay("cs_2", { amountTotal: 1000, status: "refunded", refundedAmount: 1000 });
    await pay("cs_3", { amountTotal: 8900, currency: "eur" });
    await pay("cs_4", { source: "free_code", amountTotal: 0 });
    await pay("cs_old", { amountTotal: 7700, activatedAt: NOW - 90 * DAY });
    await pay("cs_rv", { status: "disputed", needsReview: true });
    const s = await (await summary.GET(get("/api/admin/payments/summary"))).json();
    expect(s.byCurrency).toEqual([
      { currency: "usd", gross: 9900 + 1000 + 9900, refunded: 1000, net: 9900 + 9900, count: 3 },
      { currency: "eur", gross: 8900, refunded: 0, net: 8900, count: 1 },
    ]);
    expect(s).toMatchObject({ days: 30, paidCount: 4, freeCodeCount: 1, truncated: false, needsAttention: 1 });
  });
});

describe("needs attention", () => {
  it("lists open events and flagged payments with the customer and a Stripe link, and says which can be assigned", async () => {
    await testDb().collection("stripe_events").doc("evt_un").set({ type: "checkout.session.completed", status: "needs_review", outcome: "unmatched_payment", sessionId: "cs_test_lost", receivedAt: NOW - 2 * DAY, livemode: false, error: "no user" });
    await testDb().collection("stripe_events").doc("evt_ref").set({ type: "charge.refunded", status: "needs_review", outcome: "refund_partial_flagged", sessionId: "cs_test_x", uid: "u1", receivedAt: NOW - DAY, livemode: false });
    await testDb().collection("stripe_events").doc("evt_done").set({ type: "charge.refunded", status: "needs_review", outcome: "x", receivedAt: NOW, resolvedAt: NOW, livemode: false });
    await pay("cs_flag", { needsReview: true, status: "disputed", reviewNote: "dispute opened", paymentIntentId: "pi_test_f" });
    const q = await (await attention.GET(get("/api/admin/payments/attention"))).json();
    expect(q.events.map((e: { id: string }) => e.id)).toEqual(["evt_un", "evt_ref"]);
    expect(q.events[0]).toMatchObject({ assignable: true, sessionId: "cs_test_lost", stripeUrl: "https://dashboard.stripe.com/test/search?query=cs_test_lost" });
    expect(q.events[1]).toMatchObject({ assignable: false, email: "u1@example.com" });
    expect(q.payments).toHaveLength(1);
    expect(q.payments[0]).toMatchObject({ id: "cs_flag", email: "u1@example.com", status: "disputed", reviewNote: "dispute opened", stripeUrl: "https://dashboard.stripe.com/test/payments/pi_test_f" });
  });
});

describe("one payment", () => {
  it("shows its record, the customer, the Stripe events that touched it and what administrators did", async () => {
    await pay("cs_d", { paymentIntentId: "pi_test_d", invoiceId: "in_1", fulfilledBy: "webhook", grantedMs: MONTH_MS, expiresAtAfter: NOW + 5 * DAY });
    await testDb().collection("stripe_events").doc("evt_a").set({ type: "checkout.session.completed", status: "processed", outcome: "fulfilled", sessionId: "cs_d", receivedAt: NOW - 3000, livemode: false });
    await testDb().collection("stripe_events").doc("evt_b").set({ type: "charge.refunded", status: "needs_review", outcome: "refund_partial_flagged", sessionId: "cs_d", receivedAt: NOW - 1000, livemode: false });
    await testDb().collection("audit_log").add({ at: NOW, actorUid: "boss", action: "payment.review", targetType: "payment", targetId: "cs_d", note: "checked" });
    const d = await (await detail.GET(get("/api/admin/payments/cs_d"), ctx("cs_d"))).json();
    expect(d.payment).toMatchObject({ id: "cs_d", email: "u1@example.com", hasInvoice: true });
    expect(d.details).toMatchObject({ paymentIntentId: "pi_test_d", fulfilledBy: "webhook", grantedDays: 30 });
    expect(d.customer).toMatchObject({ uid: "u1", email: "u1@example.com", subscriptionExpiresAt: NOW + 5 * DAY });
    expect(d.events.map((e: { id: string }) => e.id)).toEqual(["evt_a", "evt_b"]);
    expect(d.activity).toEqual([expect.objectContaining({ action: "payment.review", note: "checked" })]);
  });
  it("404 for one that does not exist", async () => {
    expect((await detail.GET(get("/api/admin/payments/cs_nope"), ctx("cs_nope"))).status).toBe(404);
  });
});

describe("re-sync a Checkout Session", () => {
  const paid = (id: string, over: Record<string, unknown> = {}) => sessionFixture("paid", { id, customer: null, customer_email: null, metadata: { planId: "m", interval: "monthly" }, ...over });
  const waitingEvent = () => testDb().collection("stripe_events").doc("evt_un").set({ type: "checkout.session.completed", status: "needs_review", outcome: "unmatched_payment", sessionId: "cs_test_lost", receivedAt: NOW, livemode: false });

  it("a paid session the webhook missed is credited to its customer, once, and the audit says who did it", async () => {
    retrieve.mockResolvedValue(paid("cs_test_missed", { metadata: { uid: "u2", planId: "m", interval: "monthly" } }));
    const res = await resync.POST(post("/api/admin/payments/cs_test_missed/resync", { note: "customer wrote in" }), ctx("cs_test_missed"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, state: "fulfilled", uid: "u2", grantedDays: 30 });
    expect((await testDb().collection("payments").doc("cs_test_missed").get()).data()).toMatchObject({ uid: "u2", fulfilledBy: "admin", status: "fulfilled" });
    const u2 = (await testDb().collection("users").doc("u2").get()).data()!;
    expect(u2.subscriptionStatus).toBe("active");
    expect(u2.subscriptionExpiresAt).toBeGreaterThan(Date.now() + 29 * DAY);
    expect(await audit()).toEqual([expect.objectContaining({ action: "payment.resync", targetType: "payment", targetId: "cs_test_missed", actorUid: "boss", note: "customer wrote in", after: expect.objectContaining({ state: "fulfilled", uid: "u2", grantedDays: 30 }) })]);
  });

  it("running it again changes nothing: the same access is not granted twice", async () => {
    retrieve.mockResolvedValue(paid("cs_test_twice", { metadata: { uid: "u2", planId: "m", interval: "monthly" } }));
    await resync.POST(post("/api/admin/payments/cs_test_twice/resync", {}), ctx("cs_test_twice"));
    const once = (await testDb().collection("users").doc("u2").get()).get("subscriptionExpiresAt");
    const res = await resync.POST(post("/api/admin/payments/cs_test_twice/resync", {}), ctx("cs_test_twice"));
    expect(await res.json()).toMatchObject({ ok: true, state: "already_fulfilled" });
    expect((await testDb().collection("users").doc("u2").get()).get("subscriptionExpiresAt")).toBe(once);
    expect((await testDb().collection("payments").where("sessionId", "==", "cs_test_twice").get()).size).toBe(1);
  });

  it("a payment that cannot be matched asks for the customer; naming one credits them, and closes the waiting Stripe event", async () => {
    await waitingEvent();
    retrieve.mockResolvedValue(paid("cs_test_lost"));
    const first = await resync.POST(post("/api/admin/payments/cs_test_lost/resync", {}), ctx("cs_test_lost"));
    expect(first.status).toBe(422);
    expect(await first.json()).toMatchObject({ state: "unmatched" });
    expect((await testDb().collection("payments").doc("cs_test_lost").get()).exists).toBe(false);
    expect((await testDb().collection("stripe_events").doc("evt_un").get()).get("resolvedAt")).toBeUndefined();

    const second = await resync.POST(post("/api/admin/payments/cs_test_lost/resync", { uid: "u2" }), ctx("cs_test_lost"));
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ ok: true, state: "fulfilled", uid: "u2", closedEvents: 1 });
    expect((await testDb().collection("users").doc("u2").get()).get("subscriptionStatus")).toBe("active");
    const ev = (await testDb().collection("stripe_events").doc("evt_un").get()).data()!;
    expect(ev).toMatchObject({ resolvedBy: "boss" });
    expect(ev.resolutionNote).toContain("Re-synced");
    expect((await attention.GET(get("/api/admin/payments/attention")).then((r) => r.json())).events).toEqual([]);
    expect((await audit()).map((a) => a.after.state)).toEqual(["unmatched", "fulfilled"]);
  });

  it("re-syncing never closes a partial-refund or dispute event on the same payment: those need a person's decision", async () => {
    await pay("cs_test_keep", { uid: "u2", needsReview: true });
    await testDb().collection("stripe_events").doc("evt_keep").set({ type: "charge.refunded", status: "needs_review", outcome: "refund_partial_flagged", sessionId: "cs_test_keep", receivedAt: NOW, livemode: false });
    await testDb().collection("stripe_events").doc("evt_gone").set({ type: "checkout.session.completed", status: "needs_review", outcome: "unmatched_payment", sessionId: "cs_test_keep", receivedAt: NOW, livemode: false });
    retrieve.mockResolvedValue(paid("cs_test_keep", { metadata: { uid: "u2", planId: "m", interval: "monthly" } }));
    const res = await resync.POST(post("/api/admin/payments/cs_test_keep/resync", {}), ctx("cs_test_keep"));
    expect(await res.json()).toMatchObject({ state: "already_fulfilled", closedEvents: 1 });
    expect((await testDb().collection("stripe_events").doc("evt_keep").get()).get("resolvedAt")).toBeUndefined();
    expect((await testDb().collection("stripe_events").doc("evt_gone").get()).get("resolvedAt")).toBeTypeOf("number");
    expect((await testDb().collection("payments").doc("cs_test_keep").get()).get("needsReview")).toBe(true);
  });

  it("asking to credit someone else when the session was already credited changes nothing and says so", async () => {
    retrieve.mockResolvedValue(paid("cs_test_done", { metadata: { uid: "u2", planId: "m", interval: "monthly" } }));
    await resync.POST(post("/api/admin/payments/cs_test_done/resync", {}), ctx("cs_test_done"));
    const before = (await testDb().collection("users").doc("u1").get()).get("subscriptionExpiresAt");
    const res = await resync.POST(post("/api/admin/payments/cs_test_done/resync", { uid: "u1" }), ctx("cs_test_done"));
    expect(await res.json()).toMatchObject({ state: "already_fulfilled", uid: "u2", creditedToOther: true });
    expect((await testDb().collection("users").doc("u1").get()).get("subscriptionExpiresAt")).toBe(before);
  });

  it("a session Stripe has not collected grants nothing", async () => {
    retrieve.mockResolvedValue(sessionFixture("async_pending", { id: "cs_test_pending", metadata: { uid: "u2" } }));
    const res = await resync.POST(post("/api/admin/payments/cs_test_pending/resync", {}), ctx("cs_test_pending"));
    expect(res.status).toBe(409);
    expect((await res.json()).state).toBe("pending");
    expect((await testDb().collection("payments").doc("cs_test_pending").get()).exists).toBe(false);
    expect((await testDb().collection("users").doc("u2").get()).get("subscriptionStatus")).toBeUndefined();
  });

  it("clear errors: not a session id, unknown customer, Stripe has no such session, Stripe unreachable", async () => {
    expect((await resync.POST(post("/api/admin/payments/not-a-session/resync", {}), ctx("not-a-session"))).status).toBe(400);
    expect((await resync.POST(post("/api/admin/payments/cs_test_x1/resync", { uid: "ghost" }), ctx("cs_test_x1"))).status).toBe(404);
    retrieve.mockRejectedValueOnce(Object.assign(new Error("No such checkout.session"), { code: "resource_missing" }));
    const missing = await resync.POST(post("/api/admin/payments/cs_test_x2/resync", {}), ctx("cs_test_x2"));
    expect(missing.status).toBe(404);
    retrieve.mockRejectedValueOnce(new Error("socket hang up"));
    const down = await resync.POST(post("/api/admin/payments/cs_test_x3/resync", {}), ctx("cs_test_x3"));
    expect(down.status).toBe(502);
    expect((await testDb().collection("payments").get()).size).toBe(0);
    expect((await audit()).at(-1)).toMatchObject({ targetId: "cs_test_x3", after: { state: "failed" } });
  });
});

describe("marking an item reviewed", () => {
  it("resolves it in place, keeps the operator's note, and leaves an audit entry", async () => {
    await pay("cs_flag", { needsReview: true, status: "partially_refunded" });
    const res = await review.POST(post("/api/admin/review", { kind: "payment", id: "cs_flag", note: "refund was agreed with the customer" }));
    expect(res.status).toBe(200);
    expect((await testDb().collection("payments").doc("cs_flag").get()).get("needsReview")).toBe(false);
    expect((await (await attention.GET(get("/api/admin/payments/attention"))).json()).payments).toEqual([]);
    expect(await audit()).toEqual([expect.objectContaining({ action: "payment.review", targetId: "cs_flag", note: "refund was agreed with the customer", actorUid: "boss" })]);
    expect((await review.POST(post("/api/admin/review", { kind: "payment", id: "cs_flag" }))).status).toBe(409);
  });
});
