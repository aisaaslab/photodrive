import { beforeEach, describe, expect, it } from "vitest";
import { clearEmulators, testDb } from "../helpers/db";
import { seedPayment, seedPlan, seedUser } from "../helpers/seed";

beforeEach(clearEmulators);

describe("Firebase emulator wiring", () => {
  it("writes and reads Firestore through the Admin SDK", async () => {
    await testDb().collection("probe").doc("a").set({ ok: true });
    expect((await testDb().collection("probe").doc("a").get()).data()).toEqual({ ok: true });
  });

  it("seed helpers create a user, a plan and a payment", async () => {
    await seedUser("u1", { subscriptionStatus: "none" });
    await seedPlan("plan_year", { interval: "yearly" });
    await seedPayment("cs_test_1", { uid: "u1" });
    expect((await testDb().collection("users").doc("u1").get()).exists).toBe(true);
    expect((await testDb().collection("payments").doc("cs_test_1").get()).data()?.uid).toBe("u1");
  });

  it("clearEmulators isolates tests", async () => {
    expect((await testDb().collection("users").get()).size).toBe(0);
  });
});
