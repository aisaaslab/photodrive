/** S4-04: legacy plaintext gallery passwords are sealed and cleared once, by a script; reading never writes. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedUser } from "../helpers/seed";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
vi.mock("@/lib/firebase/admin-guard", async (orig) => ({
  ...(await orig<typeof import("@/lib/firebase/admin-guard")>()),
  getUidFromRequest: async () => "boss",
}));

const { hashPassword } = await import("@/lib/gallery/password");
const { openPassword, sealPassword, forOwner } = await import("@/lib/gallery/password-vault");
const { applySeal, planSeal, readGalleries, reportOf } = await import("@/lib/server/migrations/seal-legacy-passwords");
const { GET: ownerList } = await import("@/app/api/galleries/route");
const { GET: adminGalleries } = await import("@/app/api/admin/galleries/route");
const { GET: adminUsers } = await import("@/app/api/admin/users/route");

const col = () => testDb().collection("galleries");
const get = async (id: string) => (await col().doc(id).get()).data()!;
const base = (photographerId = "owner") => ({ photographerId, name: "G", slug: "s", folderId: "f", createdAt: 1 });

async function seedGalleries() {
  await col().doc("legacy").set({ ...base(), passwordHash: await hashPassword("secret-one"), password: "secret-one" });
  await col().doc("both-same").set({ ...base(), passwordHash: await hashPassword("secret-two"), password: "secret-two", passwordEnc: sealPassword("secret-two") });
  await col().doc("both-differ").set({ ...base(), passwordHash: await hashPassword("new-three"), password: "old-three", passwordEnc: sealPassword("new-three") });
  await col().doc("stale-plain").set({ ...base(), passwordHash: await hashPassword("current-four"), password: "outdated-four" });
  await col().doc("no-hash").set({ ...base(), password: "orphan-five" });
  await col().doc("clean").set({ ...base(), passwordHash: await hashPassword("secret-six"), passwordEnc: sealPassword("secret-six"), password: null });
  await col().doc("public").set({ ...base() });
}

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async () => { return { uid: "boss" }; }) as never);
  vi.stubEnv("GALLERY_JWT_SECRET", "test-secret-for-gallery-tokens-0123456789");
  vi.stubEnv("ADMIN_UID", "boss");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

describe("plan (dry run)", () => {
  it("decides per gallery, writes nothing, and the report contains no password", async () => {
    await seedGalleries();
    const plan = await planSeal(await readGalleries(testDb()));
    const byId = Object.fromEntries(plan.items.map((i) => [i.id, i]));
    expect(Object.keys(byId).sort()).toEqual(["both-differ", "both-same", "legacy", "no-hash", "stale-plain"]);
    expect(plan.alreadyClean).toBe(2); // "clean" and "public"
    expect(byId["legacy"].action).toBe("seal_and_clear");
    expect(byId["both-same"].action).toBe("clear_only");
    expect(byId["both-differ"].action).toBe("clear_only");
    expect(byId["stale-plain"].action).toBe("clear_only"); // does not match the hash: not the live password
    expect(byId["no-hash"].action).toBe("clear_only");

    const report = reportOf(plan);
    expect(report).toMatchObject({ toChange: 5, sealAndClear: 1, clearOnly: 4, alreadyClean: 2 });
    const text = JSON.stringify(report);
    for (const secret of ["secret-one", "secret-two", "old-three", "new-three", "outdated-four", "orphan-five", "current-four"]) expect(text).not.toContain(secret);
    expect(text).not.toContain("v1."); // no sealed values either
    // nothing was written
    expect((await get("legacy")).password).toBe("secret-one");
    expect((await get("legacy")).passwordEnc).toBeUndefined();
  });
});

describe("apply", () => {
  it("clears every plaintext copy, seals the verified one, keeps the authoritative sealed copy, and a second run finds nothing", async () => {
    await seedGalleries();
    const plan = await planSeal(await readGalleries(testDb()));
    expect(await applySeal(testDb(), plan.items)).toEqual({ changed: 5, skippedChanged: 0 });

    for (const id of ["legacy", "both-same", "both-differ", "stale-plain", "no-hash"]) expect((await get(id)).password, id).toBeNull();
    expect(openPassword((await get("legacy")).passwordEnc)).toBe("secret-one"); // the reminder survives
    expect(openPassword((await get("both-differ")).passwordEnc)).toBe("new-three"); // the sealed copy won
    expect((await get("stale-plain")).passwordEnc).toBeUndefined(); // an unverified plaintext is not turned into a reminder
    expect((await get("no-hash")).passwordEnc).toBeUndefined();
    // the dashboard view still works
    expect(forOwner(await get("legacy")).password).toBe("secret-one");
    // visitors are unaffected: hashes untouched
    expect((await get("legacy")).passwordHash).toMatch(/^\$2/);

    const again = await planSeal(await readGalleries(testDb()));
    expect(again.items).toEqual([]);
    expect(again.alreadyClean).toBe(7);
  });

  it("a password the owner changed after the dry run is never overwritten", async () => {
    await seedGalleries();
    const plan = await planSeal(await readGalleries(testDb()));
    // the owner sets a new password between the dry run and the apply (the PATCH route writes the sealed copy and nulls the plaintext)
    await col().doc("legacy").update({ password: null, passwordEnc: sealPassword("changed-by-owner"), passwordHash: await hashPassword("changed-by-owner") });
    await col().doc("stale-plain").delete();
    const result = await applySeal(testDb(), plan.items);
    expect(result).toEqual({ changed: 3, skippedChanged: 2 });
    expect(openPassword((await get("legacy")).passwordEnc)).toBe("changed-by-owner");
  });
});

describe("reading never writes (the lazy migration is gone)", () => {
  it("the owner's list, the admin gallery list and the admin users list leave legacy documents untouched but still show the password to its owner", async () => {
    await seedGalleries();
    await seedUser("owner", {});
    await seedUser("boss", {});
    const before = Object.fromEntries((await col().get()).docs.map((d) => [d.id, d.data()]));

    vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async () => ({ uid: "owner" })) as never);
    const req = () => new NextRequest("http://localhost/api/x", { headers: { authorization: "Bearer t" } });
    const mine = await (await ownerList(req())).json();
    expect(mine.galleries.find((g: { id: string }) => g.id === "legacy").password).toBe("secret-one");
    vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async () => ({ uid: "boss" })) as never);
    const admin = await (await adminGalleries(req())).json();
    expect(JSON.stringify(admin)).toContain("secret-one");
    expect((await adminUsers(req())).status).toBe(200);

    const after = Object.fromEntries((await col().get()).docs.map((d) => [d.id, d.data()]));
    expect(after).toEqual(before);
  });
});
