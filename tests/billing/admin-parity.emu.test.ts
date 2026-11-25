/** S1-09: admin assign_plan / grant_year use the same rule as a customer purchase. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedPlan, seedUser } from "../helpers/seed";
import { sessionFixture } from "../helpers/stripe";
import { DAY_MS, LIFETIME_SENTINEL, MONTH_MS, YEAR_MS } from "@/lib/server/billing/access";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const { fulfilCheckoutSession } = await import("@/lib/server/billing/fulfil");
const { assignPlanToUser, getPlanById } = await import("@/lib/plans");
const { POST: adminSubscription } = await import("@/app/api/admin/subscription/route");

const NOW = Date.UTC(2026, 10, 25, 12);
const expiry = (uid: string) => testDb().collection("users").doc(uid).get().then((s) => s.data()!.subscriptionExpiresAt as number);

const STARTS: Record<string, number | undefined> = {
  "never subscribed": undefined,
  "expired 30 days ago": NOW - 30 * DAY_MS,
  "expires exactly now": NOW,
  "active, 10 days left": NOW + 10 * DAY_MS,
  "active, 400 days left": NOW + 400 * DAY_MS,
  lifetime: LIFETIME_SENTINEL,
};

beforeEach(async () => {
  await clearEmulators();
  vi.unstubAllEnvs();
  await seedPlan("m", { name: "Monthly", interval: "monthly" });
  await seedPlan("y", { name: "Yearly", interval: "yearly" });
});

describe("customer purchase and admin assign_plan give identical expiry", () => {
  for (const [label, start] of Object.entries(STARTS)) {
    for (const [planId, interval] of [["m", "monthly"], ["y", "yearly"]] as const) {
      it(`${label} + ${interval}`, async () => {
        const seed = start === undefined ? {} : { subscriptionStatus: "active", subscriptionExpiresAt: start };
        await seedUser("buyer", seed);
        await seedUser("admin-assigned", seed);

        await fulfilCheckoutSession(
          sessionFixture("paid", { id: `cs_${planId}`, metadata: { uid: "buyer", planId, interval } }),
          { source: "webhook", now: () => NOW },
        );
        await assignPlanToUser("admin-assigned", (await getPlanById(planId))!, NOW);

        expect(await expiry("admin-assigned")).toBe(await expiry("buyer"));
      });
    }
  }
});

describe("admin assign_plan", () => {
  it("stacks onto an active subscription and records the plan and comp flag", async () => {
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: NOW + 10 * DAY_MS });
    const exp = await assignPlanToUser("u1", (await getPlanById("m"))!, NOW);
    expect(exp).toBe(NOW + 10 * DAY_MS + MONTH_MS);
    expect((await testDb().collection("users").doc("u1").get()).data()).toMatchObject({
      subscriptionStatus: "active",
      planId: "m",
      planName: "Monthly",
      planInterval: "monthly",
      compGranted: true,
    });
  });

  it("never shortens or moves a lifetime account", async () => {
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: LIFETIME_SENTINEL });
    expect(await assignPlanToUser("u1", (await getPlanById("y"))!, NOW)).toBe(LIFETIME_SENTINEL);
  });
});

describe("admin route actions", () => {
  const act = (body: unknown) =>
    adminSubscription(
      new NextRequest("http://localhost/api/admin/subscription", {
        method: "POST",
        headers: { authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  beforeEach(async () => {
    vi.stubEnv("ADMIN_UID", "boss");
    vi.spyOn(testAuth(), "verifyIdToken").mockResolvedValue({ uid: "boss" } as never);
    await seedUser("u1");
  });

  it("grant_year gives a year from now to a new user, and stacks on an active one", async () => {
    const before = Date.now();
    expect((await act({ uid: "u1", action: "grant_year" })).status).toBe(200);
    const first = await expiry("u1");
    expect(first).toBeGreaterThanOrEqual(before + YEAR_MS);
    expect(first).toBeLessThan(Date.now() + YEAR_MS + 1000);
    await act({ uid: "u1", action: "grant_year" });
    expect(await expiry("u1")).toBe(first + YEAR_MS);
  });

  it("grant_year leaves a lifetime account alone", async () => {
    await act({ uid: "u1", action: "grant_lifetime" });
    expect(await expiry("u1")).toBe(LIFETIME_SENTINEL);
    await act({ uid: "u1", action: "grant_year" });
    expect(await expiry("u1")).toBe(LIFETIME_SENTINEL);
  });

  it("assign_plan via the route, revoke, and non-admins are refused", async () => {
    expect((await act({ uid: "u1", action: "assign_plan", planId: "y" })).status).toBe(200);
    expect(await expiry("u1")).toBeGreaterThan(Date.now() + YEAR_MS - 5000);
    await act({ uid: "u1", action: "revoke" });
    expect(await expiry("u1")).toBe(0);
    vi.spyOn(testAuth(), "verifyIdToken").mockResolvedValue({ uid: "someone" } as never);
    expect((await act({ uid: "u1", action: "grant_year" })).status).toBe(403);
  });
});
