/** S8-04: the live "needs attention" counts that feed the Overview and the Payments / Support tab badges. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedPayment, seedUser } from "../helpers/seed";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
const { GET } = await import("@/app/api/admin/attention/route");

let token = "boss-token";
const get = () => GET(new NextRequest("http://localhost/api/admin/attention", { headers: { authorization: `Bearer ${token}` } }));
const counts = async () => (await get()).json() as Promise<{ payments: number; supportUnread: number; supportOpen: number; total: number }>;
const NOW = Date.now();

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  token = "boss-token";
  vi.stubEnv("ADMIN_UID", "boss");
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async (t: string) => {
    if (t === "boss-token") return { uid: "boss" };
    if (t === "user-token") return { uid: "u1" };
    throw new Error("bad token");
  }) as never);
  await seedUser("boss");
});

describe("GET /api/admin/attention", () => {
  it("only administrators; never cached", async () => {
    token = "user-token"; expect((await get()).status).toBe(403);
    token = "nope"; expect((await get()).status).toBe(401);
    token = "boss-token";
    const ok = await get();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
  });

  it("is all zeros when there is nothing to do", async () => {
    expect(await counts()).toEqual({ payments: 0, supportUnread: 0, supportOpen: 0, total: 0 });
  });

  it("counts open Stripe events and flagged payments, but not events or payments already dealt with", async () => {
    const ev = (id: string, o: Record<string, unknown>) => testDb().collection("stripe_events").doc(id).set({ type: "charge.refunded", receivedAt: NOW, ...o });
    await ev("e1", { status: "needs_review", outcome: "unmatched_payment" });
    await ev("e2", { status: "needs_review", outcome: "refund_partial_flagged" });
    await ev("e3", { status: "needs_review", outcome: "x", resolvedAt: NOW }); // dealt with
    await ev("e4", { status: "processed", outcome: "fulfilled" });
    await seedPayment("cs_1", { needsReview: true });
    await seedPayment("cs_2", { needsReview: false });
    await seedPayment("cs_3", {});
    expect(await counts()).toMatchObject({ payments: 3, total: 3 });
  });

  it("counts unread and open support messages, and messages from before read/status existed are unread", async () => {
    const m = (id: string, o: Record<string, unknown>) => testDb().collection("contactMessages").doc(id).set({ name: "V", email: "v@example.com", subject: "s", message: "hello there", createdAt: NOW, ...o });
    await m("a", { read: false });
    await m("b", { read: true });
    await m("c", { read: true, status: "resolved" });
    await m("legacy", {});
    expect(await counts()).toMatchObject({ supportUnread: 2, supportOpen: 3, payments: 0, total: 2 });
  });

  it("adds up: the total is payment items plus unread messages", async () => {
    await seedPayment("cs_1", { needsReview: true });
    await testDb().collection("contactMessages").doc("a").set({ name: "V", email: "v@example.com", subject: "s", message: "hello there", createdAt: NOW, read: false });
    expect(await counts()).toEqual({ payments: 1, supportUnread: 1, supportOpen: 1, total: 2 });
  });
});
