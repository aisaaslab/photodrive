/** S7-04 against the Firestore and Auth emulators: the overview comes from aggregation queries, is stored in one document, and matches a brute-force count. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { clearEmulators, testAuth, testDb } from "../helpers/db";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const { computeOverview, readOverview, recomputeOverview, OVERVIEW_TTL_MS, REFRESH_MIN_AGE_MS } = await import("@/lib/server/repos/stats");
const { GET: statsRoute } = await import("@/app/api/admin/stats/route");
const { GET: cron } = await import("@/app/api/cron/stats-recompute/route");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 5, 15, 12);
const LIFETIME = 32503680000000;

async function seed() {
  const db = testDb();
  // 6 users: created 1d, 3d, 10d, 40d ago (Timestamps) and 2d ago (a number, as a restored profile can be) and one with none.
  const users: [string, Record<string, unknown>][] = [
    ["u1", { name: "Ann", createdAt: Timestamp.fromMillis(NOW - 1 * DAY), subscriptionStatus: "active", subscriptionExpiresAt: NOW + 5 * DAY, planInterval: "monthly", planName: "Pro" }],
    ["u2", { name: "Bob", createdAt: Timestamp.fromMillis(NOW - 3 * DAY), subscriptionStatus: "active", subscriptionExpiresAt: NOW + 200 * DAY, planInterval: "yearly", planName: "Pro" }],
    ["u3", { name: "Cy", createdAt: Timestamp.fromMillis(NOW - 10 * DAY), subscriptionStatus: "active", subscriptionExpiresAt: LIFETIME, compGranted: true }],
    ["u4", { name: "Di", createdAt: Timestamp.fromMillis(NOW - 40 * DAY), subscriptionStatus: "canceled", subscriptionExpiresAt: NOW + 3 * DAY, planInterval: "monthly" }], // expiry in the future but not active
    ["u5", { name: "Ed", createdAt: NOW - 2 * DAY, subscriptionStatus: "active", subscriptionExpiresAt: NOW - 1 * DAY, planInterval: "monthly" }], // expired
    ["u6", { name: "Flo" }],
  ];
  for (const [id, data] of users) {
    await db.collection("users").doc(id).set(data);
    await testAuth().createUser({ uid: id, email: `${id}@example.com`, displayName: data.name as string });
  }
  await db.collection("galleries").doc("g1").set({ createdAt: NOW - 2 * DAY });
  await db.collection("galleries").doc("g2").set({ createdAt: NOW - 50 * DAY });
  await db.collection("plans").doc("p1").set({ name: "Pro", currency: "usd", active: true, isPublic: true });
  await db.collection("plans").doc("p2").set({ name: "Hidden", currency: "eur", active: true, isPublic: false });
  const pay = (id: string, amountTotal: number | null, currency: string | undefined, at: number) =>
    db.collection("payments").doc(id).set({ amountTotal, ...(currency ? { currency } : {}), activatedAt: at });
  await pay("a", 1900, "usd", NOW - 1 * DAY);
  await pay("b", 2500, "usd", NOW - 2 * DAY);
  await pay("c", 1000, "eur", NOW - 3 * DAY);
  await pay("d", 0, "usd", NOW - 4 * DAY); // free code
  await pay("e", null, "usd", NOW - 5 * DAY); // no amount recorded
}

beforeEach(async () => {
  await clearEmulators();
  vi.unstubAllEnvs();
  vi.stubEnv("ADMIN_UID", "boss");
});

describe("computeOverview", () => {
  it("matches the numbers worked out by hand", async () => {
    await seed();
    const { stats, expiringSoon, recentUsers } = await computeOverview(testDb(), NOW);
    expect(stats).toMatchObject({
      totalUsers: 6, newUsers7d: 3, newUsers30d: 4, // u1, u2 (timestamps) and u5 (number) in 7 days; plus u3 in 30
      activeSubscriptions: 3, monthlySubscriptions: 1, yearlySubscriptions: 1, compSubscriptions: 1,
      totalGalleries: 2, newGalleries30d: 1, freeCodeSignups: 1, paymentCount: 3, // 1900, 2500, 1000 (0 and null are not payments)
      expiringSoonCount: 1, planCount: 2, publicPlanCount: 1,
    });
    expect(stats.revenueByCurrency).toEqual({ usd: 44, eur: 10 });
    expect(stats.revenueUsd).toBe(44);
    expect(expiringSoon.map((x) => [x.uid, x.daysLeft, x.planName, x.email])).toEqual([["u1", 5, "Pro", "u1@example.com"]]);
    expect(recentUsers).toHaveLength(5);
    expect(recentUsers[0]).toMatchObject({ uid: "u1", subscriptionActive: true, email: "u1@example.com" });
  });

  it("never adds different currencies together", async () => {
    await seed();
    const { stats } = await computeOverview(testDb(), NOW);
    expect(stats.revenueByCurrency.usd).toBe(44);
    expect(stats.revenueByCurrency.eur).toBe(10);
    expect(Object.keys(stats.revenueByCurrency).sort()).toEqual(["eur", "usd"]);
  });

  it("works on an empty database", async () => {
    const { stats, expiringSoon, recentUsers } = await computeOverview(testDb(), NOW);
    expect(stats.totalUsers).toBe(0);
    expect(stats.revenueByCurrency).toEqual({});
    expect(expiringSoon).toEqual([]);
    expect(recentUsers).toEqual([]);
  });
});

describe("the stored document", () => {
  it("is served for ten minutes without being recomputed, then refreshed", async () => {
    await seed();
    const first = await readOverview(testDb(), NOW);
    expect(first.cached).toBe(false);
    await testDb().collection("users").doc("late").set({ name: "Late", createdAt: Timestamp.fromMillis(NOW) });
    const again = await readOverview(testDb(), NOW + OVERVIEW_TTL_MS - 1000);
    expect(again.cached).toBe(true);
    expect(again.overview.stats.totalUsers).toBe(6);
    const later = await readOverview(testDb(), NOW + OVERVIEW_TTL_MS + 1000);
    expect(later.cached).toBe(false);
    expect(later.overview.stats.totalUsers).toBe(7);
  });

  it("is rewritten by the recompute, and a damaged document is replaced", async () => {
    await seed();
    await testDb().collection("system_state").doc("stats-overview").set({ computedAt: "garbage" });
    const r = await readOverview(testDb(), NOW);
    expect(r.cached).toBe(false);
    expect(r.overview.stats.totalUsers).toBe(6);
    await recomputeOverview(testDb(), NOW);
    expect((await testDb().collection("system_state").doc("stats-overview").get()).get("computedAt")).toBe(NOW);
  });
});

describe("the endpoints", () => {
  it("the admin endpoint refuses everyone but an admin", async () => {
    const r = await statsRoute(new NextRequest("http://localhost/api/admin/stats"));
    expect(r.status).toBe(401);
  });

  it("the cron endpoint needs the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await cron(new NextRequest("http://localhost/api/cron/stats-recompute"))).status).toBe(401);
    expect((await cron(new NextRequest("http://localhost/api/cron/stats-recompute", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    await seed();
    const ok = await cron(new NextRequest("http://localhost/api/cron/stats-recompute", { headers: { authorization: "Bearer s3cret" } }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).totalUsers).toBe(6);
    expect((await testDb().collection("system_state").doc("stats-overview").get()).exists).toBe(true);
  });

  it("the cron endpoint refuses to run without CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await cron(new NextRequest("http://localhost/api/cron/stats-recompute"))).status).toBe(500);
  });
});

describe("revenue per currency in the right units (S8-04)", () => {
  const pay = (id: string, amountTotal: number, currency: string) => testDb().collection("payments").doc(id).set({ amountTotal, currency, activatedAt: NOW - DAY });

  it("a zero-decimal currency is not divided by 100 (¥4,800 is 4800), and the exact minor-unit figures are kept", async () => {
    await pay("a", 9900, "usd");
    await pay("b", 8900, "eur");
    await pay("c", 4800, "jpy");
    const { stats } = await computeOverview(testDb(), NOW);
    expect(stats.revenueByCurrency).toEqual({ usd: 99, eur: 89, jpy: 4800 });
    expect(stats.revenueMinor).toEqual({ usd: 9900, eur: 8900, jpy: 4800 });
  });

  it("a currency nobody paid in is absent, not zero", async () => {
    const { stats } = await computeOverview(testDb(), NOW);
    expect(stats.revenueMinor).toEqual({});
  });
});

describe("refreshing the overview on demand", () => {
  it("recomputes only when the stored numbers are at least 30 seconds old; without a refresh it waits for the ten-minute cache", async () => {
    await seed();
    const first = await readOverview(testDb(), NOW);
    expect(first.cached).toBe(false);
    const tooSoon = await readOverview(testDb(), NOW + REFRESH_MIN_AGE_MS - 1000, { refresh: true });
    expect(tooSoon.cached).toBe(true);
    expect(tooSoon.overview.computedAt).toBe(NOW);
    const later = await readOverview(testDb(), NOW + REFRESH_MIN_AGE_MS + 1000, { refresh: true });
    expect(later.cached).toBe(false);
    expect(later.overview.computedAt).toBe(NOW + REFRESH_MIN_AGE_MS + 1000);
    const noRefresh = await readOverview(testDb(), NOW + REFRESH_MIN_AGE_MS + 61_000);
    expect(noRefresh.cached).toBe(true); // well inside the ten minutes
  });

  it("the endpoint honours ?refresh=1 for an administrator", async () => {
    await seed();
    vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async () => ({ uid: "boss" })) as never);
    await testDb().collection("system_state").doc("stats-overview").set({ ...(await computeOverview(testDb(), Date.now() - 120_000)) });
    const call = (q = "") => statsRoute(new NextRequest(`http://localhost/api/admin/stats${q}`, { headers: { authorization: "Bearer t" } }));
    expect((await (await call()).json()).cached).toBe(true);
    const forced = await (await call("?refresh=1")).json();
    expect(forced.cached).toBe(false);
    expect(Date.now() - forced.computedAt).toBeLessThan(10_000);
  });
});
