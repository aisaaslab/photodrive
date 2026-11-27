/** S3-13 (D18): public / private galleries through the owner and admin APIs. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedUser } from "../helpers/seed";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const { POST: create, GET: list } = await import("@/app/api/galleries/route");
const { PATCH: edit } = await import("@/app/api/galleries/[id]/route");
const { PATCH: adminEdit } = await import("@/app/api/admin/galleries/[id]/route");
const { verifyPassword } = await import("@/lib/gallery/password");
const { openPassword } = await import("@/lib/gallery/password-vault");

const FOLDER = "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
let asUid = "owner";

const req = (method: string, body?: unknown, raw?: string) =>
  new NextRequest("http://localhost/api/galleries", {
    method,
    headers: { authorization: "Bearer t", "content-type": "application/json" },
    ...(method === "GET" ? {} : { body: raw ?? JSON.stringify(body) }),
  });
const post = (body: unknown, raw?: string) => create(req("POST", body, raw));
const patch = (id: string, body: unknown, raw?: string) => edit(req("PATCH", body, raw), { params: Promise.resolve({ id }) });
const adminPatch = (id: string, body: unknown) => adminEdit(req("PATCH", body), { params: Promise.resolve({ id }) });
const doc = async (id: string) => (await testDb().collection("galleries").doc(id).get()).data()!;
const count = async () => (await testDb().collection("galleries").get()).size;

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("GALLERY_JWT_SECRET", "test-secret-for-gallery-tokens-0123456789");
  vi.stubEnv("ADMIN_UID", "boss");
  asUid = "owner";
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async () => ({ uid: asUid })) as never);
  await seedUser("owner", { subscriptionStatus: "active", subscriptionExpiresAt: Date.now() + 86_400_000 });
  await seedUser("other", { subscriptionStatus: "active", subscriptionExpiresAt: Date.now() + 86_400_000 });
});

/** A gallery created through the API, returning its id. */
async function make(body: Record<string, unknown>) {
  const res = await post({ name: "G", driveUrl: FOLDER, ...body });
  expect(res.status).toBe(201);
  return (await res.json()).id as string;
}

describe("creating a gallery", () => {
  it("private with a password: stored hashed and sealed, never as plaintext, and the owner sees it", async () => {
    const res = await post({ name: "Wedding", driveUrl: FOLDER, visibility: "private", password: "correct horse" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ visibility: "private", password: "correct horse" });
    expect(body.passwordHash).toBeDefined();

    const stored = await doc(body.id);
    expect(stored.visibility).toBe("private");
    expect(await verifyPassword("correct horse", stored.passwordHash)).toBe(true);
    expect(JSON.stringify(stored)).not.toContain("correct horse"); // no plaintext in the database
    expect(openPassword(stored.passwordEnc)).toBe("correct horse");
  });

  it("private without a password is refused and nothing is saved", async () => {
    for (const password of [undefined, "", null]) {
      const res = await post({ name: "G", driveUrl: FOLDER, visibility: "private", password });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "A private gallery needs a password" });
    }
    expect(await count()).toBe(0);
  });

  it("public has no password, and a public gallery with a password is refused", async () => {
    const id = await make({ visibility: "public" });
    expect(await doc(id)).toMatchObject({ visibility: "public" });
    expect((await doc(id)).passwordHash).toBeUndefined();
    const res = await post({ name: "G", driveUrl: FOLDER, visibility: "public", password: "x" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "A public gallery cannot have a password" });
    expect(await count()).toBe(1);
  });

  it("clients that send no visibility keep working: password = private, none = public", async () => {
    expect(await doc(await make({ password: "pw" }))).toMatchObject({ visibility: "private" });
    expect(await doc(await make({}))).toMatchObject({ visibility: "public" });
  });

  it("rejects bad input with 400, never 500", async () => {
    expect((await post(undefined, "{nope")).status).toBe(400);
    expect((await post(["array"])).status).toBe(400);
    expect((await post(null, "null")).status).toBe(400);
    expect((await post({ name: "G", driveUrl: FOLDER, visibility: "secret" })).status).toBe(400);
    expect((await post({ name: "G", driveUrl: FOLDER, visibility: "private", password: 123 })).status).toBe(400);
    expect((await post({ name: "G", driveUrl: FOLDER, visibility: "private", password: "x".repeat(201) })).status).toBe(400);
    expect(await count()).toBe(0);
  });
});

describe("editing a gallery (owner)", () => {
  it("private to public removes the password and invalidates old unlock cookies", async () => {
    const id = await make({ visibility: "private", password: "pw1" });
    await testDb().collection("galleries").doc(id).update({ pwChangedAt: 5 });
    const res = await patch(id, { visibility: "public" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ visibility: "public", password: null });
    const stored = await doc(id);
    expect(stored).toMatchObject({ visibility: "public", passwordHash: null, passwordEnc: null, password: null });
    expect(stored.pwChangedAt).toBeGreaterThan(5);
  });

  it("public to private needs a password; with one it is hashed and cookies reset", async () => {
    const id = await make({ visibility: "public" });
    const refused = await patch(id, { visibility: "private" });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "A private gallery needs a password" });
    expect((await doc(id)).visibility).toBe("public");

    expect((await patch(id, { visibility: "private", password: "fresh" })).status).toBe(200);
    const stored = await doc(id);
    expect(stored.visibility).toBe("private");
    expect(await verifyPassword("fresh", stored.passwordHash)).toBe(true);
    expect(stored.pwChangedAt).toBeGreaterThan(0);
  });

  it("a private gallery keeps its password when it is not sent, and changes it when it is", async () => {
    const id = await make({ visibility: "private", password: "old-pass" });
    const before = (await doc(id)).passwordHash;
    expect((await patch(id, { name: "Renamed", visibility: "private" })).status).toBe(200);
    expect((await doc(id)).passwordHash).toBe(before);
    expect((await doc(id)).name).toBe("Renamed");

    expect((await patch(id, { password: "new-pass" })).status).toBe(200);
    expect(await verifyPassword("new-pass", (await doc(id)).passwordHash)).toBe(true);
  });

  it("a private gallery can never lose its password without becoming public", async () => {
    const id = await make({ visibility: "private", password: "pw" });
    const before = await doc(id);
    for (const body of [{ removePassword: true, visibility: "private" }, { visibility: "private", password: "" }]) {
      const res = await patch(id, body);
      if (body.removePassword) expect(res.status).toBe(400);
      else expect(res.status).toBe(200); // blank means "keep"
    }
    const after = await doc(id);
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.visibility).toBe("private");
    // setting a password on a public gallery while asking for public is refused
    const pubId = await make({ visibility: "public" });
    expect((await patch(pubId, { visibility: "public", password: "x" })).status).toBe(400);
  });

  it("older clients: removePassword makes it public", async () => {
    const id = await make({ visibility: "private", password: "pw" });
    expect((await patch(id, { removePassword: true })).status).toBe(200);
    expect(await doc(id)).toMatchObject({ visibility: "public", passwordHash: null });
  });

  it("leaves visibility and password alone when the request does not mention them", async () => {
    const id = await make({ visibility: "private", password: "pw" });
    const before = await doc(id);
    expect((await patch(id, { name: "Only a rename", allowDownload: false })).status).toBe(200);
    const after = await doc(id);
    expect(after).toMatchObject({ name: "Only a rename", visibility: "private", passwordHash: before.passwordHash });
    expect(after.pwChangedAt).toBe(before.pwChangedAt);
  });

  it("only the owner can edit; bad bodies are 400", async () => {
    const id = await make({ visibility: "private", password: "pw" });
    asUid = "other";
    expect((await patch(id, { visibility: "public" })).status).toBe(404);
    expect((await doc(id)).visibility).toBe("private");
    asUid = "owner";
    expect((await patch(id, undefined, "{bad")).status).toBe(400);
    expect((await patch(id, { visibility: "hidden" })).status).toBe(400);
  });
});

describe("galleries created before visibility existed", () => {
  it("are derived: password means private, none means public, and nothing needs migrating", async () => {
    const { hashPassword } = await import("@/lib/gallery/password");
    await testDb().collection("galleries").doc("old-private").set({
      photographerId: "owner", name: "Old private", slug: "op", folderId: "f", createdAt: 2, passwordHash: await hashPassword("legacy"),
    });
    await testDb().collection("galleries").doc("old-public").set({
      photographerId: "owner", name: "Old public", slug: "oq", folderId: "f", createdAt: 1,
    });
    const rows = ((await (await list(req("GET"))).json()) as { galleries: { id: string; visibility: string }[] }).galleries;
    expect(Object.fromEntries(rows.map((r) => [r.id, r.visibility]))).toEqual({ "old-private": "private", "old-public": "public" });

    // editing an old private gallery without touching its password keeps it private and working
    expect((await patch("old-private", { name: "Renamed" })).status).toBe(200);
    expect(await verifyPassword("legacy", (await doc("old-private")).passwordHash)).toBe(true);
    // an old private gallery cannot be switched to public by accident of an empty password
    expect((await patch("old-private", { visibility: "private", password: "" })).status).toBe(200);
    expect((await doc("old-private")).passwordHash).toBeTruthy();
  });
});

describe("admin editing", () => {
  beforeEach(() => void (asUid = "boss"));

  it("follows the same rules: private needs a password, public has none", async () => {
    asUid = "owner";
    const id = await make({ visibility: "public" });
    asUid = "boss";
    expect((await adminPatch(id, { visibility: "private" })).status).toBe(400);
    expect((await adminPatch(id, { visibility: "private", password: "admin-set" })).status).toBe(200);
    expect(await verifyPassword("admin-set", (await doc(id)).passwordHash)).toBe(true);
    expect(await (await adminPatch(id, { visibility: "public" })).json()).toMatchObject({ visibility: "public", password: null });
    expect((await doc(id)).passwordHash).toBeNull();
  });

  it("answers 403 to non-admins and 404 to an unknown gallery", async () => {
    asUid = "owner";
    expect((await adminPatch("nope", { visibility: "public" })).status).toBe(403);
    asUid = "boss";
    expect((await adminPatch("nope", { visibility: "public" })).status).toBe(404);
  });

  it("older admin clients: an empty password field is removePassword and makes the gallery public", async () => {
    asUid = "owner";
    const id = await make({ visibility: "private", password: "pw" });
    asUid = "boss";
    expect((await adminPatch(id, { removePassword: true })).status).toBe(200);
    expect(await doc(id)).toMatchObject({ visibility: "public", passwordHash: null });
  });
});
