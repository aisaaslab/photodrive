/** S10-02: gallery usage counts through the real routes: views (deduped per session), downloads, favourites, the owner's list, deletion. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedUser } from "../helpers/seed";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
const listing = vi.hoisted(() => vi.fn());
vi.mock("@/lib/drive/client", () => ({ fetchDriveFolder: listing }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { POST: view } = await import("@/app/api/galleries/[id]/view/route");
const { GET: proxy } = await import("@/app/api/photos/proxy/route");
const { GET: downloadAll } = await import("@/app/api/galleries/[id]/download-all/route");
const { POST: toggle } = await import("@/app/api/galleries/[id]/selection/route");
const { GET: list } = await import("@/app/api/galleries/route");
const { DELETE: remove } = await import("@/app/api/galleries/[id]/route");
const { signGalleryToken } = await import("@/lib/gallery/session");
const { recordGalleryEvent, pruneOldDays } = await import("@/lib/server/repos/galleryStats");
const { dayKey } = await import("@/lib/gallery/stats");

const FILE = "driveFile1";
let n = 0;
const ip = () => ({ "x-real-ip": `198.51.100.${++n % 250}` });
const seed = (id = "g1", extra: Record<string, unknown> = {}) =>
  testDb().collection("galleries").doc(id).set({ photographerId: "owner", name: "G", slug: id, folderId: "folder1", createdAt: 1, ...extra });
const stats = async (id = "g1") => (await testDb().collection("gallery_stats").doc(id).get()).data();
const open = (id = "g1", cookie = "") => view(new NextRequest(`http://localhost/api/galleries/${id}/view`, { method: "POST", headers: { ...ip(), ...(cookie ? { cookie } : {}) } }), { params: Promise.resolve({ id }) });
const getFull = (headers: Record<string, string> = {}) => proxy(new NextRequest(`http://localhost/api/photos/proxy?g=g1&fileId=${FILE}&size=full`, { headers: { ...ip(), ...headers } }));
const fav = (action = "add", id = FILE) =>
  toggle(new NextRequest("http://localhost/api/galleries/g1/selection", { method: "POST", headers: { "content-type": "application/json", ...ip() }, body: JSON.stringify({ action, item: { id, name: `${id}.jpg` } }) }), { params: Promise.resolve({ id: "g1" }) });

beforeEach(async () => {
  vi.unstubAllGlobals();
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("GOOGLE_DRIVE_API_KEY", "test-key");
  vi.stubEnv("GALLERY_JWT_SECRET", "test-secret-for-gallery-tokens-0123456789");
  vi.stubEnv("ADMIN_UID", "boss");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  listing.mockReset().mockResolvedValue({ files: [{ id: FILE, name: "a.jpg", mimeType: "image/jpeg" }, { id: "f2", name: "b.jpg", mimeType: "image/jpeg" }], subfolders: [] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("bytes", { status: 200, headers: { "content-type": "image/jpeg", "content-length": "5" } })));
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async (t: string) => {
    if (t === "owner-token") return { uid: "owner" };
    throw new Error("bad token");
  }) as never);
  await seedUser("owner", { subscriptionStatus: "active", subscriptionExpiresAt: Date.now() + 86_400_000 });
});

describe("views", () => {
  it("count once per browser session: the first call counts and sets a cookie, a reload with the cookie counts nothing", async () => {
    await seed();
    const first = await open();
    expect(await first.json()).toEqual({ counted: true });
    const cookie = first.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("gv_g1=1");
    expect(cookie.toLowerCase()).not.toContain("max-age"); // a session cookie
    expect(cookie.toLowerCase()).not.toContain("expires");
    expect(await (await open("g1", "gv_g1=1")).json()).toEqual({ counted: false });
    const s = await stats();
    expect(s?.views).toBe(1);
    expect(s?.lastViewAt).toBeTypeOf("number");
    expect(s?.days[dayKey(Date.now())].views).toBe(1);
  });

  it("a new session counts again", async () => {
    await seed();
    await open();
    await open();
    expect((await stats())?.views).toBe(2);
  });

  it("a private gallery counts only for a visitor who unlocked it", async () => {
    await seed("g1", { visibility: "private", passwordHash: "x", pwChangedAt: 0 });
    expect(await (await open()).json()).toEqual({ counted: false });
    expect(await stats()).toBeUndefined();
    const cookie = `gallery_token_g1=${await signGalleryToken("g1", 0)}`;
    expect(await (await open("g1", cookie)).json()).toEqual({ counted: true });
    expect((await stats())?.views).toBe(1);
  });

  it("unknown, malformed and switched-off galleries and demos count nothing", async () => {
    await seed("off", { disabled: true });
    await testDb().collection("demo_galleries").doc("demo1").set({ folderId: "f", createdAt: 1, expiresAt: Date.now() + 60_000 });
    for (const id of ["nope", "off", "demo1"]) expect(await (await open(id)).json()).toEqual({ counted: false });
    expect((await open("bad id!")).status).toBe(400);
    expect((await testDb().collection("gallery_stats").get()).size).toBe(0);
  });
});

describe("downloads and favourites", () => {
  it("an original delivered to a visitor is one download; the owner's own are not counted; thumbnails are not downloads", async () => {
    await seed();
    expect((await getFull()).status).toBe(200);
    expect((await getFull()).status).toBe(200);
    expect((await getFull({ authorization: "Bearer owner-token" })).status).toBe(200);
    await proxy(new NextRequest(`http://localhost/api/photos/proxy?g=g1&fileId=${FILE}&size=thumb`, { headers: ip() }));
    expect((await stats())?.downloads).toBe(2);
  });

  it("a refused download is not counted", async () => {
    await seed("g1", { allowDownload: false });
    expect((await getFull()).status).toBe(403);
    expect(await stats()).toBeUndefined();
  });

  it("download-all counts the photos in the zip", async () => {
    await seed();
    const res = await downloadAll(new NextRequest("http://localhost/api/galleries/g1/download-all", { headers: ip() }), { params: Promise.resolve({ id: "g1" }) });
    expect(res.status).toBe(200);
    expect((await stats())?.downloads).toBe(2);
  });

  it("a new favourite counts, adding the same one again or removing it does not", async () => {
    await seed();
    await fav("add");
    await fav("add");
    await fav("remove");
    await fav("add", "f2");
    expect((await stats())?.favorites).toBe(2);
  });
});

describe("the owner's list and deletion", () => {
  it("GET /api/galleries carries each gallery's counts and last visit, and nothing for an unopened one", async () => {
    await seed("g1");
    await seed("g2");
    await open("g1");
    await getFull();
    const res = await list(new NextRequest("http://localhost/api/galleries", { headers: { authorization: "Bearer owner-token" } }));
    const { galleries } = await res.json();
    const g1 = galleries.find((g: { id: string }) => g.id === "g1");
    expect(g1.stats).toMatchObject({ views: 1, downloads: 1, favorites: 0, last30: { views: 1, downloads: 1 } });
    expect(g1.stats.lastViewAt).toBeTypeOf("number");
    expect(galleries.find((g: { id: string }) => g.id === "g2").stats).toBeUndefined();
  });

  it("deleting a gallery deletes its counts", async () => {
    await seed();
    await open();
    expect(await stats()).toBeDefined();
    const res = await remove(new NextRequest("http://localhost/api/galleries/g1", { method: "DELETE", headers: { authorization: "Bearer owner-token" } }), { params: Promise.resolve({ id: "g1" }) });
    expect(res.status).toBe(200);
    expect(await stats()).toBeUndefined();
  });
});

describe("30 daily buckets", () => {
  it("a view drops buckets older than 30 days and keeps the totals", async () => {
    const now = Date.UTC(2026, 10, 27, 12);
    const old = dayKey(now - 40 * 86_400_000);
    const recent = dayKey(now - 5 * 86_400_000);
    await testDb().collection("gallery_stats").doc("g1").set({ galleryId: "g1", views: 50, days: { [old]: { views: 30 }, [recent]: { views: 20 } } });
    await recordGalleryEvent("g1", "view", { now });
    const s = await stats();
    expect(Object.keys(s?.days).sort()).toEqual([recent, dayKey(now)].sort());
    expect(s?.views).toBe(51);
    expect(await pruneOldDays("g1", now)).toBe(0); // nothing left to drop
  });
});
