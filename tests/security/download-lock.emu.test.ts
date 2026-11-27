/** S9-06: "switch off downloads once a selection is sent", enforced by the server on every route that serves originals. */
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
vi.mock("@/lib/email", () => ({ sendEmail: async () => false }));

const { POST: submit } = await import("@/app/api/galleries/[id]/selection/submit/route");
const { POST: toggle } = await import("@/app/api/galleries/[id]/selection/route");
const { GET: proxy } = await import("@/app/api/photos/proxy/route");
const { GET: downloadAll } = await import("@/app/api/galleries/[id]/download-all/route");
const { PATCH: edit } = await import("@/app/api/galleries/[id]/route");
const { GET: media } = await import("@/app/api/g/[galleryId]/media/[token]/route");
const { signedMediaUrl } = await import("@/lib/server/media-token");

const FILE = "driveFile1";
let n = 0;
const ip = () => ({ "x-real-ip": `198.51.100.${++n % 250}` });
const seed = (extra: Record<string, unknown> = {}) =>
  testDb().collection("galleries").doc("g1").set({ photographerId: "owner", name: "G", slug: "g1", folderId: "folder1", createdAt: 1, ...extra });
const getProxy = (headers: Record<string, string> = {}) =>
  proxy(new NextRequest(`http://localhost/api/photos/proxy?g=g1&fileId=${FILE}&size=full`, { headers: { ...ip(), ...headers } }));
const getZip = (headers: Record<string, string> = {}) =>
  downloadAll(new NextRequest("http://localhost/api/galleries/g1/download-all", { headers: { ...ip(), ...headers } }), { params: Promise.resolve({ id: "g1" }) });
const send = () =>
  submit(new NextRequest("http://localhost/api/galleries/g1/selection/submit", { method: "POST", headers: { "content-type": "application/json", ...ip() }, body: JSON.stringify({ name: "Maria" }) }), { params: Promise.resolve({ id: "g1" }) });
const pick = () =>
  toggle(new NextRequest("http://localhost/api/galleries/g1/selection", { method: "POST", headers: { "content-type": "application/json", ...ip() }, body: JSON.stringify({ action: "add", item: { id: FILE, name: "a.jpg" } }) }), { params: Promise.resolve({ id: "g1" }) });
const patch = (body: unknown) =>
  edit(new NextRequest("http://localhost/api/galleries/g1", { method: "PATCH", headers: { authorization: "Bearer owner-token", "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: "g1" }) });
const getMedia = () => {
  const url = new URL(signedMediaUrl("g1", FILE, "full"), "http://localhost");
  const [, , , g, , token] = url.pathname.split("/");
  return media(new NextRequest(url, { headers: ip() }), { params: Promise.resolve({ galleryId: g, token }) });
};
const doc = async () => (await testDb().collection("galleries").doc("g1").get()).data()!;

beforeEach(async () => {
  vi.unstubAllGlobals(); // the previous test stubbed fetch, which clearEmulators needs for real
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("GOOGLE_DRIVE_API_KEY", "test-key");
  vi.stubEnv("GALLERY_JWT_SECRET", "test-secret-for-gallery-tokens-0123456789");
  vi.stubEnv("ADMIN_UID", "boss");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  listing.mockReset().mockResolvedValue({ files: [{ id: FILE, name: "a.jpg", mimeType: "image/jpeg" }], subfolders: [] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("bytes", { status: 200, headers: { "content-type": "image/jpeg", "content-length": "5" } })));
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async (t: string) => {
    if (t === "owner-token") return { uid: "owner" };
    throw new Error("bad token");
  }) as never);
  await seedUser("owner", { subscriptionStatus: "active", subscriptionExpiresAt: Date.now() + 86_400_000 });
});

describe("switch off downloads once a selection is sent", () => {
  it("before anything is sent, originals download normally", async () => {
    await seed({ disableDownloadAfterSubmit: true });
    expect((await getProxy()).status).toBe(200);
    expect((await getZip()).status).toBe(200);
  });

  it("after the client sends a selection, every original download is refused by the server, but the owner keeps access", async () => {
    await seed({ disableDownloadAfterSubmit: true });
    await pick();
    const res = await send();
    expect(await res.json()).toMatchObject({ ok: true, downloadsLocked: true });
    expect((await doc()).downloadsLockedAt).toBeTypeOf("number");

    expect((await getProxy()).status).toBe(403);   // photo proxy
    expect((await getMedia()).status).toBe(403);   // signed media route
    expect((await getZip()).status).toBe(403);     // download all
    expect((await getProxy({ authorization: "Bearer owner-token" })).status).toBe(200); // the photographer's own originals
  });

  it("without the option, sending a selection changes nothing", async () => {
    await seed();
    await pick();
    expect(await (await send()).json()).toMatchObject({ downloadsLocked: false });
    expect((await doc()).downloadsLockedAt).toBeUndefined();
    expect((await getProxy()).status).toBe(200);
  });

  it("saving the gallery settings again with the option unchanged does NOT give downloads back", async () => {
    await seed({ disableDownloadAfterSubmit: true });
    await pick();
    await send();
    expect((await patch({ name: "Renamed", disableDownloadAfterSubmit: true })).status).toBe(200);
    expect((await doc()).downloadsLockedAt).toBeTypeOf("number");
    expect((await getProxy()).status).toBe(403);
  });

  it("turning the option off gives downloads back; turning it on later does not lock retroactively", async () => {
    await seed({ disableDownloadAfterSubmit: true });
    await pick();
    await send();
    await patch({ disableDownloadAfterSubmit: false });
    expect((await doc()).downloadsLockedAt).toBeNull();
    expect((await getProxy()).status).toBe(200);
    await patch({ disableDownloadAfterSubmit: true });
    expect((await getProxy()).status).toBe(200);
    await send();
    expect((await getProxy()).status).toBe(403);
  });

  it("only the owner can change the option", async () => {
    await seed();
    const res = await edit(new NextRequest("http://localhost/api/galleries/g1", { method: "PATCH", headers: { authorization: "Bearer nope", "content-type": "application/json" }, body: JSON.stringify({ disableDownloadAfterSubmit: true }) }), { params: Promise.resolve({ id: "g1" }) });
    expect(res.status).toBe(401);
    expect((await doc()).disableDownloadAfterSubmit).toBeUndefined();
  });
});
