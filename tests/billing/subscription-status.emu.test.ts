import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth } from "../helpers/db";
import { seedUser } from "../helpers/seed";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const { GET } = await import("@/app/api/user/subscription/route");
const get = () => GET(new NextRequest("http://localhost/api/user/subscription", { headers: { authorization: "Bearer t" } }));

beforeEach(async () => {
  await clearEmulators();
  vi.unstubAllEnvs();
  vi.spyOn(testAuth(), "verifyIdToken").mockResolvedValue({ uid: "u1" } as never);
  await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: Date.now() + 86_400_000 });
});

describe("/api/user/subscription canRenewEarly", () => {
  it("is false until BILLING_FULFIL_V2 is on, so active users keep going to the dashboard", async () => {
    expect(await (await get()).json()).toMatchObject({ isActive: true, canRenewEarly: false });
  });

  it("is true with BILLING_FULFIL_V2=1, so the subscribe page offers renewal", async () => {
    vi.stubEnv("BILLING_FULFIL_V2", "1");
    expect(await (await get()).json()).toMatchObject({ isActive: true, canRenewEarly: true });
  });
});
