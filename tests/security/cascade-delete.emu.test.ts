/** S4-02: deleting a gallery or an account also removes the client favourites and submissions that belong to it. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedUser } from "../helpers/seed";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
let asUid = "owner";
vi.mock("@/lib/firebase/admin-guard", async (orig) => ({
  ...(await orig<typeof import("@/lib/firebase/admin-guard")>()),
  getUidFromRequest: async () => asUid,
}));

const { DELETE: deleteGallery } = await import("@/app/api/galleries/[id]/route");
const { DELETE: deleteAccount } = await import("@/app/api/user/delete/route");
const { DELETE: adminDeleteUser } = await import("@/app/api/admin/users/[uid]/route");
const { deleteGalleriesCascade, deleteGalleryCascade, deleteUserGalleries } = await import("@/lib/server/repos/galleries");

const db = () => testDb();
const exists = async (path: string) => (await db().doc(path).get()).exists;

async function gallery(id: string, owner: string, withSelection = true) {
  await db().collection("galleries").doc(id).set({ photographerId: owner, name: id, slug: id, folderId: "f", createdAt: 1 });
  if (withSelection) {
    await db().collection("gallery_selections").doc(id).set({
      galleryId: id, items: [{ id: "f1", name: "a.jpg" }], count: 1,
      submission: { name: "Client", email: "client@example.com", note: "n", count: 1, submittedAt: 5 },
    });
  }
}
const legacyFavorite = (galleryId: string, n: number) =>
  db().collection("favorites").doc(`${galleryId}_p${n}_s`).set({ galleryId, photoId: `p${n}`, sessionId: "s", createdAt: 1 });
const req = (method: string) => new NextRequest("http://localhost/api/x", { method, headers: { authorization: "Bearer t" } });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.stubEnv("ADMIN_UID", "boss");
  asUid = "owner";
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async () => ({ uid: asUid })) as never);
  await seedUser("owner", {});
  await seedUser("other", {});
});

describe("deleteGalleryCascade", () => {
  it("removes the gallery, its favourites and submission, and legacy favourite documents, and nothing else", async () => {
    await gallery("g1", "owner");
    await gallery("g2", "owner");
    await legacyFavorite("g1", 1);
    await legacyFavorite("g1", 2);
    await legacyFavorite("g2", 1);
    const result = await deleteGalleryCascade(db(), "g1");
    expect(result).toEqual({ galleries: 1, selections: 1, legacyFavorites: 2 });
    expect(await exists("galleries/g1")).toBe(false);
    expect(await exists("gallery_selections/g1")).toBe(false);
    expect((await db().collection("favorites").where("galleryId", "==", "g1").get()).size).toBe(0);
    // the other gallery is untouched
    expect(await exists("galleries/g2")).toBe(true);
    expect(await exists("gallery_selections/g2")).toBe(true);
    expect((await db().collection("favorites").where("galleryId", "==", "g2").get()).size).toBe(1);
  });

  it("works for a gallery that never had favourites, and for ids that do not exist", async () => {
    await gallery("bare", "owner", false);
    await expect(deleteGalleriesCascade(db(), ["bare", "never-existed", "bare"])).resolves.toMatchObject({ galleries: 2 });
    expect(await exists("galleries/bare")).toBe(false);
    await expect(deleteGalleriesCascade(db(), [])).resolves.toEqual({ galleries: 0, selections: 0, legacyFavorites: 0 });
  });

  it("handles more galleries than fit in one batch, and more than an `in` query allows", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `bulk${i}`);
    for (let i = 0; i < ids.length; i += 150) await Promise.all(ids.slice(i, i + 150).map((id) => gallery(id, "owner")));
    await legacyFavorite("bulk449", 1);
    await deleteUserGalleries(db(), "owner");
    expect((await db().collection("galleries").get()).size).toBe(0);
    expect((await db().collection("gallery_selections").get()).size).toBe(0);
    expect((await db().collection("favorites").get()).size).toBe(0);
  });

  it("a failure part-way leaves the gallery in place, so the deletion can be repeated (no orphans nobody can find)", async () => {
    await gallery("g1", "owner");
    vi.spyOn(db(), "batch").mockImplementationOnce((() => ({ delete() {}, commit: () => Promise.reject(new Error("boom")) })) as never);
    await expect(deleteGalleryCascade(db(), "g1")).rejects.toThrow("boom");
    expect(await exists("galleries/g1")).toBe(true);
    vi.restoreAllMocks();
    await deleteGalleryCascade(db(), "g1");
    expect(await exists("galleries/g1")).toBe(false);
    expect(await exists("gallery_selections/g1")).toBe(false);
  });
});

describe("the deletion routes", () => {
  it("owner deletes a gallery: its favourites and submission go too; another user's gallery cannot be deleted", async () => {
    await gallery("mine", "owner");
    await gallery("theirs", "other");
    expect((await deleteGallery(req("DELETE"), ctx({ id: "theirs" }))).status).toBe(404);
    expect(await exists("gallery_selections/theirs")).toBe(true);
    expect((await deleteGallery(req("DELETE"), ctx({ id: "mine" }))).status).toBe(200);
    expect(await exists("galleries/mine")).toBe(false);
    expect(await exists("gallery_selections/mine")).toBe(false);
    expect(await exists("galleries/theirs")).toBe(true);
  });

  it("a user deleting their own account removes every gallery of theirs with its favourites, and only theirs", async () => {
    await gallery("a", "owner");
    await gallery("b", "owner");
    await gallery("x", "other");
    expect((await deleteAccount(req("DELETE"))).status).toBe(200);
    expect(await exists("users/owner")).toBe(false);
    for (const id of ["a", "b"]) {
      expect(await exists(`galleries/${id}`)).toBe(false);
      expect(await exists(`gallery_selections/${id}`)).toBe(false);
    }
    expect(await exists("galleries/x")).toBe(true);
    expect(await exists("gallery_selections/x")).toBe(true);
    expect(await exists("users/other")).toBe(true);
  });

  it("an administrator deleting a user does the same", async () => {
    await gallery("a", "other");
    await gallery("keep", "owner");
    asUid = "boss";
    expect((await adminDeleteUser(req("DELETE"), ctx({ uid: "other" }))).status).toBe(200);
    expect(await exists("galleries/a")).toBe(false);
    expect(await exists("gallery_selections/a")).toBe(false);
    expect(await exists("users/other")).toBe(false);
    expect(await exists("galleries/keep")).toBe(true);
    expect(await exists("gallery_selections/keep")).toBe(true);
  });

  it("no orphaned selection documents remain after any of the above", async () => {
    await gallery("a", "owner");
    await gallery("b", "owner");
    await deleteGallery(req("DELETE"), ctx({ id: "a" }));
    await deleteAccount(req("DELETE"));
    const galleries = new Set((await db().collection("galleries").get()).docs.map((d) => d.id));
    const orphans = (await db().collection("gallery_selections").get()).docs.filter((d) => !galleries.has(d.id));
    expect(orphans).toEqual([]);
  });
});
