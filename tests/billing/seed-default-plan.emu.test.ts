import { beforeEach, describe, expect, it } from "vitest";
import { clearEmulators, testDb } from "../helpers/db";
import { seedPlan } from "../helpers/seed";
import { DEFAULT_PLAN_ID, seedDefaultPlan } from "@/lib/server/billing/seed-default-plan";

beforeEach(clearEmulators);
const plans = () => testDb().collection("plans").get();

describe("seedDefaultPlan (S1-07)", () => {
  it("dry run (default) reports the plan and writes nothing", async () => {
    const r = await seedDefaultPlan(testDb());
    expect(r).toMatchObject({ action: "create", applied: false, plan: { id: DEFAULT_PLAN_ID, name: "Annual", priceCents: 9900 } });
    expect((await plans()).size).toBe(0);
  });

  it("--apply creates one public, active, yearly plan the app can sell", async () => {
    const r = await seedDefaultPlan(testDb(), { apply: true, now: 1000 });
    expect(r).toMatchObject({ action: "create", applied: true });
    const doc = (await testDb().collection("plans").doc(DEFAULT_PLAN_ID).get()).data();
    expect(doc).toMatchObject({
      name: "Annual",
      interval: "yearly",
      priceCents: 9900,
      currency: "usd",
      isPublic: true,
      active: true,
      createdAt: 1000,
    });
    expect(doc?.features).toHaveLength(7);
  });

  it("is idempotent: a second run does nothing", async () => {
    await seedDefaultPlan(testDb(), { apply: true });
    const again = await seedDefaultPlan(testDb(), { apply: true });
    expect(again).toMatchObject({ action: "skip", reason: "already_seeded" });
    expect((await plans()).size).toBe(1);
  });

  it("never touches a shop that already has its own plans", async () => {
    await seedPlan("my-plan", { name: "Pro" });
    const r = await seedDefaultPlan(testDb(), { apply: true });
    expect(r).toEqual({ action: "skip", reason: "other_plans_exist", existingPlanIds: ["my-plan"] });
    expect((await plans()).size).toBe(1);
  });
});
