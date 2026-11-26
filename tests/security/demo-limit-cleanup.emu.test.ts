/** S3-07: the demo limit is a rolling per-visitor limit, demos get a TTL field, and expired ones are cleaned up. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { clearEmulators, testDb } from "../helpers/db";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const { POST: create } = await import("@/app/api/demo/create/route");
const { GET: cron } = await import("@/app/api/cron/cleanup/route");
const { cleanupExpiredDemos, DEMO_GRACE_MS, DEMO_LIFETIME_MS } = await import("@/lib/server/cleanup");

const FOLDER = "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const DAY = 24 * 60 * 60 * 1000;
let n = 0;
const freshIp = () => `203.0.113.${++n}`;
const post = (body: unknown, ip: string, extra: Record<string, string> = {}, raw?: string) =>
  create(new NextRequest("http://localhost/api/demo/create", {
    method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip, ...extra }, body: raw ?? JSON.stringify(body),
  }));
const demoCount = async () => (await testDb().collection("demo_galleries").get()).size;

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("CRON_SECRET", "cron-secret-value");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

describe("creating a demo", () => {
  it("creates a 10-minute demo with a TTL timestamp, and stores no IP address", async () => {
    const before = Date.now();
    const res = await post({ driveUrl: FOLDER }, freshIp());
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const doc = (await testDb().collection("demo_galleries").doc(id).get()).data()!;
    expect(doc.folderId).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
    expect(doc.expiresAt - doc.createdAt).toBe(DEMO_LIFETIME_MS);
    expect(doc.createdAt).toBeGreaterThanOrEqual(before);
    expect(doc.expiresAtTs).toBeInstanceOf(Timestamp); // Firestore's TTL policy needs a real Timestamp
    expect(doc.expiresAtTs.toMillis()).toBe(doc.expiresAt + DEMO_GRACE_MS);
    expect(doc.ip).toBeUndefined();
    expect(JSON.stringify(doc)).not.toMatch(/203\.0\.113/);
  });

  it("allows 3 a day per visitor, then 429 with Retry-After", async () => {
    const ip = freshIp();
    for (let i = 0; i < 3; i++) expect((await post({ driveUrl: FOLDER }, ip)).status, `demo ${i + 1}`).toBe(201);
    const fourth = await post({ driveUrl: FOLDER }, ip);
    expect(fourth.status).toBe(429);
    expect(await fourth.json()).toEqual({ error: "Demo limit reached" });
    expect(Number(fourth.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Number(fourth.headers.get("retry-after"))).toBeLessThanOrEqual(24 * 60 * 60);
    expect(await demoCount()).toBe(3);
  });

  it("a visitor is NOT blocked for good by demos that already exist (the old all-time count is gone)", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) {
      await testDb().collection("demo_galleries").add({ folderId: "f", createdAt: 1, expiresAt: 2, ip }); // legacy documents
    }
    expect((await post({ driveUrl: FOLDER }, ip)).status).toBe(201);
  });

  it("is per visitor, and a forged X-Forwarded-For does not dodge it", async () => {
    const ip = freshIp();
    for (let i = 0; i < 3; i++) await post({ driveUrl: FOLDER }, ip, { "x-forwarded-for": `9.9.9.${i}` });
    expect((await post({ driveUrl: FOLDER }, ip, { "x-forwarded-for": "7.7.7.7" })).status).toBe(429);
    expect((await post({ driveUrl: FOLDER }, freshIp())).status).toBe(201);
  });

  it("invalid requests answer 400 and do not use up a demo", async () => {
    const ip = freshIp();
    for (const body of [{}, { driveUrl: "" }, { driveUrl: 5 }, { driveUrl: "https://example.com/not-drive" }, { driveUrl: "x".repeat(501) }]) {
      expect((await post(body, ip)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await post(undefined, ip, {}, "{nope")).status).toBe(400);
    for (let i = 0; i < 3; i++) expect((await post({ driveUrl: FOLDER }, ip)).status).toBe(201); // all three still available
  });

  it("caps attempts, so invalid requests cannot be hammered", async () => {
    const ip = freshIp();
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await post({}, ip)).status;
    expect(last).toBe(429);
  });
});

describe("cleanup of expired demos", () => {
  const NOW = Date.UTC(2026, 10, 26, 3);
  const demo = (id: string, expiresAt: number | undefined) =>
    testDb().collection("demo_galleries").doc(id).set({ folderId: "f", createdAt: 1, ...(expiresAt === undefined ? {} : { expiresAt }) });

  it("deletes demos that expired more than a day ago and keeps the rest", async () => {
    await demo("old", NOW - 2 * DAY);
    await demo("just-over-a-day", NOW - DAY - 1);
    await demo("within-grace", NOW - DAY + 60_000); // expired, but still shows the 'expired' page
    await demo("fresh", NOW + 5 * 60_000);
    await demo("no-expiry-field", undefined);
    expect(await cleanupExpiredDemos(testDb(), NOW)).toBe(2);
    const left = (await testDb().collection("demo_galleries").get()).docs.map((d) => d.id).sort();
    expect(left).toEqual(["fresh", "no-expiry-field", "within-grace"]);
  });

  it("is idempotent and copes with more than one batch", async () => {
    const batch = testDb().batch();
    for (let i = 0; i < 450; i++) batch.set(testDb().collection("demo_galleries").doc(`old-${i}`), { folderId: "f", expiresAt: NOW - 5 * DAY });
    await batch.commit();
    expect(await cleanupExpiredDemos(testDb(), NOW)).toBe(450);
    expect(await cleanupExpiredDemos(testDb(), NOW)).toBe(0);
    expect(await demoCount()).toBe(0);
  });
});

describe("GET /api/cron/cleanup", () => {
  const call = (auth?: string) => cron(new NextRequest("http://localhost/api/cron/cleanup", { headers: auth ? { authorization: auth } : {} }));

  it("fails closed without CRON_SECRET, refuses a wrong secret, and runs with the right one", async () => {
    await testDb().collection("demo_galleries").doc("old").set({ folderId: "f", expiresAt: Date.now() - 3 * DAY });
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(await demoCount()).toBe(1);
    const res = await call("Bearer cron-secret-value");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deletedDemos: 1 });
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(500);
  });
});
