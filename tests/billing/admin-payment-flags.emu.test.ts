/** S2-09: refunded / disputed / needs-review payments are visible on the admin users page. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth } from "../helpers/db";
import { seedPayment, seedUser } from "../helpers/seed";
import { paymentFlagSeverity, paymentFlagsByUid } from "@/lib/access-source";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const { GET } = await import("@/app/api/admin/users/route");
const doc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

describe("paymentFlagsByUid (pure)", () => {
  it("lists refunded, partly refunded, disputed, dispute-lost and needs-review payments, and nothing else", () => {
    const flags = paymentFlagsByUid([
      doc("ok", { uid: "u1", status: "fulfilled", activatedAt: 1 }),
      doc("legacy", { uid: "u1", activatedAt: 2 }), // pre-S1-03 payment, no status
      doc("ref", { uid: "u1", status: "refunded", amountTotal: 900, currency: "usd", refundedAmount: 900, activatedAt: 3 }),
      doc("part", { uid: "u2", status: "partially_refunded", refundedAmount: 200, needsReview: true, reviewNote: "Partial refund", activatedAt: 4 }),
      doc("dis", { uid: "u3", status: "disputed", needsReview: true, activatedAt: 5 }),
      doc("lost", { uid: "u3", status: "dispute_lost", activatedAt: 6 }),
      doc("rev", { uid: "u4", status: "fulfilled", needsReview: true, reviewNote: "legacy payment revoked", activatedAt: 7 }),
      doc("nouid", { status: "refunded" }),
    ]);
    expect([...flags.keys()].sort()).toEqual(["u1", "u2", "u3", "u4"]);
    expect(flags.get("u1")!.map((f) => f.sessionId)).toEqual(["ref"]);
    expect(flags.get("u2")![0]).toMatchObject({ status: "partially_refunded", needsReview: true, reviewNote: "Partial refund", refundedAmount: 200 });
    expect(flags.get("u4")![0]).toMatchObject({ status: "fulfilled", needsReview: true });
  });

  it("orders worst first, then newest first", () => {
    const list = paymentFlagsByUid([
      doc("a", { uid: "u", status: "partially_refunded", activatedAt: 10 }),
      doc("b", { uid: "u", status: "dispute_lost", activatedAt: 1 }),
      doc("c", { uid: "u", status: "fulfilled", needsReview: true, activatedAt: 99 }),
      doc("d", { uid: "u", status: "refunded", activatedAt: 5 }),
      doc("e", { uid: "u", status: "refunded", activatedAt: 8 }),
      doc("f", { uid: "u", status: "disputed", activatedAt: 3 }),
    ]).get("u")!;
    expect(list.map((f) => f.sessionId)).toEqual(["b", "f", "e", "d", "a", "c"]);
    expect(paymentFlagSeverity(list[0])).toBeLessThan(paymentFlagSeverity(list[5]));
  });

  it("ignores junk field types instead of crashing", () => {
    const flags = paymentFlagsByUid([doc("x", { uid: "u", status: "refunded", amountTotal: "9", currency: 5, refundedAmount: null, reviewNote: 3, activatedAt: "now" })]);
    expect(flags.get("u")![0]).toMatchObject({ amountTotal: null, currency: null, refundedAmount: null, reviewNote: null, activatedAt: 0 });
  });
});

describe("GET /api/admin/users", () => {
  const call = () => GET(new NextRequest("http://localhost/api/admin/users", { headers: { authorization: "Bearer t" } }));
  let asUid = "boss";

  beforeEach(async () => {
    await clearEmulators();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("ADMIN_UID", "boss");
    vi.stubEnv("GALLERY_JWT_SECRET", "test-secret-for-gallery-tokens-0123456789");
    asUid = "boss";
    vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async () => ({ uid: asUid })) as never);
  });

  it("returns each user's problem payments, so an operator can see a refund without opening Stripe", async () => {
    await seedUser("clean");
    await seedPayment("cs_clean", { uid: "clean", status: "fulfilled", amountTotal: 900, currency: "usd", activatedAt: 1 });
    await seedUser("refunded");
    await seedPayment("cs_ref", { uid: "refunded", status: "refunded", amountTotal: 9900, currency: "usd", refundedAmount: 9900, activatedAt: 2 });
    await seedUser("disputed");
    await seedPayment("cs_dis", { uid: "disputed", status: "disputed", needsReview: true, amountTotal: 900, currency: "usd", reviewNote: "Dispute open", activatedAt: 3 });
    await seedPayment("cs_ok2", { uid: "disputed", status: "fulfilled", amountTotal: 900, currency: "usd", activatedAt: 4 });

    const res = await call();
    expect(res.status).toBe(200);
    const users = (await res.json()).users as { uid: string; paymentFlags: { sessionId: string; status: string }[] }[];
    const by = Object.fromEntries(users.map((u) => [u.uid, u.paymentFlags]));
    expect(by.clean).toEqual([]);
    expect(by.refunded).toMatchObject([{ sessionId: "cs_ref", status: "refunded", amountTotal: 9900, refundedAmount: 9900 }]);
    expect(by.disputed).toMatchObject([{ sessionId: "cs_dis", status: "disputed", needsReview: true, reviewNote: "Dispute open" }]);
    expect(users.find((u) => u.uid === "boss")?.paymentFlags ?? []).toEqual([]);
  });

  it("shows a payment flagged by the refund handler (S2-02) end to end", async () => {
    // exactly what revokePayment writes for a legacy payment: status refunded + needsReview + note
    await seedUser("legacy");
    await seedPayment("cs_leg", {
      uid: "legacy", status: "refunded", needsReview: true, amountTotal: 9900, currency: "usd", activatedAt: 5,
      reviewNote: "Granted time derived from the plan period (payment predates grantedMs); verify the user's expiry.",
    });
    const users = (await (await call()).json()).users as { uid: string; paymentFlags: { reviewNote: string | null }[] }[];
    expect(users.find((u) => u.uid === "legacy")!.paymentFlags[0].reviewNote).toContain("verify the user's expiry");
  });

  it("stays admin-only", async () => {
    asUid = "someone-else";
    expect((await call()).status).toBe(403);
  });
});
