/** S2-15: the signed-in user's payment list carries what became of each payment. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth } from "../helpers/db";
import { seedPayment, seedUser } from "../helpers/seed";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const { GET } = await import("@/app/api/user/payments/route");
let asUid = "u1";
const call = () => GET(new NextRequest("http://localhost/api/user/payments", { headers: { authorization: "Bearer t" } }));
type Row = { sessionId: string; status: string; refundedAmount: number | null; changedAt: number | null; amountTotal: number | null };

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("ADMIN_UID", "boss");
  asUid = "u1";
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async () => ({ uid: asUid })) as never);
  await seedUser("u1");
  await seedUser("u2");
});

describe("GET /api/user/payments", () => {
  it("includes the status, refunded amount and when access changed", async () => {
    await seedPayment("cs_ok", { uid: "u1", amountTotal: 900, currency: "usd", activatedAt: 5, status: "fulfilled" });
    await seedPayment("cs_ref", { uid: "u1", amountTotal: 9900, currency: "usd", activatedAt: 4, status: "refunded", refundedAmount: 9900, revokedAt: 1234 });
    await seedPayment("cs_part", { uid: "u1", amountTotal: 9900, currency: "usd", activatedAt: 3, status: "partially_refunded", refundedAmount: 2000 });
    await seedPayment("cs_dis", { uid: "u1", amountTotal: 900, currency: "usd", activatedAt: 2, status: "disputed", revokedAt: 99 });
    await seedPayment("cs_lost", { uid: "u1", amountTotal: 900, currency: "usd", activatedAt: 1, status: "dispute_lost", revokedAt: 100 });
    const rows = (await (await call()).json()).payments as Row[];
    const by = Object.fromEntries(rows.map((r) => [r.sessionId, r]));
    expect(by.cs_ok).toMatchObject({ status: "fulfilled", refundedAmount: null, changedAt: null });
    expect(by.cs_ref).toMatchObject({ status: "refunded", refundedAmount: 9900, changedAt: 1234 });
    expect(by.cs_part).toMatchObject({ status: "partially_refunded", refundedAmount: 2000, changedAt: null });
    expect(by.cs_dis).toMatchObject({ status: "disputed", changedAt: 99 });
    expect(by.cs_lost).toMatchObject({ status: "dispute_lost", changedAt: 100 });
  });

  it("treats a payment from before statuses existed as a plain paid one, and ignores junk values", async () => {
    await seedPayment("cs_old", { uid: "u1", amountTotal: 9900, currency: "usd", activatedAt: 2 });
    await seedPayment("cs_junk", { uid: "u1", amountTotal: 900, currency: "usd", activatedAt: 1, status: "banana", refundedAmount: "lots", revokedAt: "yesterday" });
    const rows = (await (await call()).json()).payments as Row[];
    for (const r of rows) expect(r).toMatchObject({ status: "fulfilled", refundedAmount: null, changedAt: null });
  });

  it("returns only the caller's own payments and none to an admin", async () => {
    await seedPayment("cs_mine", { uid: "u1", amountTotal: 900, currency: "usd", activatedAt: 2, status: "refunded" });
    await seedPayment("cs_theirs", { uid: "u2", amountTotal: 900, currency: "usd", activatedAt: 1, status: "disputed" });
    expect(((await (await call()).json()).payments as Row[]).map((r) => r.sessionId)).toEqual(["cs_mine"]);
    asUid = "boss";
    expect((await (await call()).json()).payments).toEqual([]);
  });

  it("needs a signed-in user", async () => {
    vi.spyOn(testAuth(), "verifyIdToken").mockRejectedValue(new Error("no"));
    expect((await call()).status).toBe(401);
  });
});
