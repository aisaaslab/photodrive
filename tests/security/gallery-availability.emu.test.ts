/** S9-04 / S9-05 (decision D3): a gallery's own expiry date, and what happens to galleries after the owner's plan ends (14 days of grace, then offline; nothing deleted; renewal restores at once). */
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

const proxy = await import("@/app/api/photos/proxy/route");
const media = await import("@/app/api/g/[galleryId]/media/[token]/route");
const selection = await import("@/app/api/galleries/[id]/selection/route");
const submit = await import("@/app/api/galleries/[id]/selection/submit/route");
const downloadAll = await import("@/app/api/galleries/[id]/download-all/route");
const verifyPassword = await import("@/app/api/gallery/verify-password/route");
const view = await import("@/app/api/galleries/[id]/view/route");
const galleries = await import("@/app/api/galleries/route");
const item = await import("@/app/api/galleries/[id]/route");
const subscription = await import("@/app/api/user/subscription/route");
const { default: GalleryPage } = await import("@/app/gallery/[slug]/page");
const { GalleryUnavailable } = await import("@/components/gallery/GalleryUnavailable");
const { signedMediaUrl } = await import("@/lib/server/media-token");
const { forgetOwnerPlan } = await import("@/lib/server/gallery-availability");
const { hashPassword } = await import("@/lib/gallery/password");

const DAY = 86_400_000;
const FILE = "drive_file-1";
const FOLDER = "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
let n = 0;
const ip = () => ({ "x-real-ip": `198.51.100.${++n % 250}` });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const seed = (id: string, extra: Record<string, unknown> = {}) =>
  testDb().collection("galleries").doc(id).set({ photographerId: "owner", name: id, slug: id, folderId: `folder-${id}`, createdAt: 1000 + n++, ...extra });
const setPlan = (expiresAt: number | null) =>
  testDb().collection("users").doc("owner").set({ subscriptionStatus: "active", ...(expiresAt === null ? {} : { subscriptionExpiresAt: expiresAt }) }, { merge: true });
const owner = (url: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) =>
  new NextRequest(url, { ...init, headers: { authorization: "Bearer owner-token", "content-type": "application/json", ...ip() } });

const thumbVisitor = (g: string) => {
  const url = new URL(signedMediaUrl(g, FILE, "thumb"), "http://localhost");
  const [, , , gid, , token] = url.pathname.split("/");
  return media.GET(new NextRequest(url, { headers: ip() }), { params: Promise.resolve({ galleryId: gid, token }) });
};
const proxied = (g: string, token?: string) =>
  proxy.GET(new NextRequest(`http://localhost/api/photos/proxy?g=${g}&fileId=${FILE}&size=thumb`, { headers: { ...ip(), ...(token ? { authorization: `Bearer ${token}` } : {}) } }));
const patch = (id: string, body: unknown) => item.PATCH(owner(`http://localhost/api/galleries/${id}`, { method: "PATCH", body: JSON.stringify(body) }), ctx(id));
const listOwn = async () => (await (await galleries.GET(owner("http://localhost/api/galleries"))).json()).galleries as { id: string; availability: { state: string; reason?: string; graceEndsAt?: number } }[];
const pageOf = async (slug: string) => (await GalleryPage({ params: Promise.resolve({ slug }) })) as { type: unknown };

/** Every way a visitor can reach a gallery. */
async function visitorStatuses(id: string) {
  const sel = (m: string) => new NextRequest(`http://localhost/api/galleries/${id}/selection`, { method: m, headers: { "content-type": "application/json", ...ip() }, ...(m === "POST" ? { body: JSON.stringify({ action: "add", item: { id: FILE, name: "a.jpg" } }) } : {}) });
  return {
    proxy: (await proxied(id)).status,
    media: (await thumbVisitor(id)).status,
    selectionGet: (await selection.GET(sel("GET"), ctx(id))).status,
    selectionPost: (await selection.POST(sel("POST"), ctx(id))).status,
    submit: (await submit.POST(new NextRequest(`http://localhost/api/galleries/${id}/selection/submit`, { method: "POST", headers: { "content-type": "application/json", ...ip() }, body: JSON.stringify({ name: "Maria" }) }), ctx(id))).status,
    downloadAll: (await downloadAll.GET(new NextRequest(`http://localhost/api/galleries/${id}/download-all`, { headers: ip() }), ctx(id))).status,
    verify: (await verifyPassword.POST(new NextRequest("http://localhost/api/gallery/verify-password", { method: "POST", headers: { "content-type": "application/json", ...ip() }, body: JSON.stringify({ slug: id, password: "x" }) }))).status,
    page: (await pageOf(id)).type === GalleryUnavailable ? "unavailable" : "shown",
  };
}
const ALL_REFUSED = { proxy: 404, media: 404, selectionGet: 404, selectionPost: 404, submit: 404, downloadAll: 404, verify: 404, page: "unavailable" };

beforeEach(async () => {
  vi.unstubAllGlobals();
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  forgetOwnerPlan();
  vi.stubEnv("GOOGLE_DRIVE_API_KEY", "test-key");
  vi.stubEnv("GALLERY_JWT_SECRET", "test-secret-for-gallery-tokens-0123456789");
  vi.stubEnv("ADMIN_UID", "boss");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  listing.mockReset().mockResolvedValue({ files: [{ id: FILE, mimeType: "image/jpeg", name: "a.jpg", size: "5" }], subfolders: [] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("bytes", { status: 200, headers: { "content-type": "image/jpeg", "content-length": "5" } })));
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async (t: string) => {
    if (t === "owner-token") return { uid: "owner" };
    throw new Error("bad token");
  }) as never);
  await seedUser("owner", { subscriptionStatus: "active", subscriptionExpiresAt: Date.now() + 30 * DAY });
});

describe("S9-05: the gallery's own expiry date", () => {
  it("a gallery past its date is unreachable by every visitor route, and nothing is deleted", async () => {
    await seed("g1", { expiresAt: Date.now() - 1000 });
    expect(await visitorStatuses("g1")).toEqual(ALL_REFUSED);
    expect((await testDb().collection("galleries").doc("g1").get()).exists).toBe(true);
  });

  it("before its date it is shown normally", async () => {
    await seed("g1", { expiresAt: Date.now() + 5 * DAY });
    expect(await visitorStatuses("g1")).toMatchObject({ proxy: 200, media: 200, selectionGet: 200, page: "shown" });
  });

  it("the owner can still use an expired gallery (see its photos, fetch the selection) and an expired gallery is not counted as a view", async () => {
    await seed("g1", { expiresAt: Date.now() - 1000 });
    expect((await proxied("g1", "owner-token")).status).toBe(200);
    expect((await selection.GET(owner("http://localhost/api/galleries/g1/selection"), ctx("g1"))).status).toBe(200);
    expect(await (await view.POST(new NextRequest("http://localhost/api/galleries/g1/view", { method: "POST", headers: ip() }), ctx("g1"))).json()).toEqual({ counted: false });
  });

  it("extending the date brings it back at once; clearing it makes it permanent again", async () => {
    await seed("g1", { expiresAt: Date.now() - 1000 });
    expect((await visitorStatuses("g1")).proxy).toBe(404);
    const res = await patch("g1", { expiresAt: new Date(Date.now() + 10 * DAY).toISOString().slice(0, 10) });
    expect(res.status).toBe(200);
    expect(await visitorStatuses("g1")).toMatchObject({ proxy: 200, page: "shown" });
    await patch("g1", { expiresAt: new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10) });
    expect((await visitorStatuses("g1")).proxy).toBe(404);
    await patch("g1", { expiresAt: "" });
    expect((await testDb().collection("galleries").doc("g1").get()).data()?.expiresAt).toBeNull();
    expect((await visitorStatuses("g1")).proxy).toBe(200);
  });

  it("a date that is not a real day is refused and changes nothing", async () => {
    await seed("g1", { expiresAt: Date.now() + DAY });
    const before = (await testDb().collection("galleries").doc("g1").get()).data()?.expiresAt;
    for (const bad of ["2026-02-30", "soon", 5, "2999-01-01"]) expect((await patch("g1", { expiresAt: bad })).status).toBe(400);
    expect((await testDb().collection("galleries").doc("g1").get()).data()?.expiresAt).toBe(before);
  });

  it("only the owner can change it", async () => {
    await seed("g1");
    const res = await item.PATCH(new NextRequest("http://localhost/api/galleries/g1", { method: "PATCH", headers: { authorization: "Bearer nope", "content-type": "application/json" }, body: JSON.stringify({ expiresAt: "2030-01-01" }) }), ctx("g1"));
    expect(res.status).toBe(401);
  });

  it("can be set when the gallery is created, and a bad date there is refused", async () => {
    const make = (body: object) => galleries.POST(owner("http://localhost/api/galleries", { method: "POST", body: JSON.stringify({ name: "New", driveUrl: FOLDER, ...body }) }));
    const ok = await make({ expiresAt: "2030-06-30" });
    expect(ok.status).toBe(201);
    expect((await ok.json()).expiresAt).toBe(Date.UTC(2030, 5, 30, 23, 59, 59, 999));
    expect((await make({ expiresAt: "nonsense" })).status).toBe(400);
    expect("expiresAt" in (await (await make({})).json())).toBe(false);
  });
});

describe("S9-04 (D3): after the owner's plan ends", () => {
  const enforce = () => vi.stubEnv("GALLERY_LAPSE_ENFORCE", "1");

  it("with enforcement off (the default) a lapsed plan changes nothing: the live shop is untouched", async () => {
    await seed("g1");
    await setPlan(Date.now() - 100 * DAY);
    expect(await visitorStatuses("g1")).toMatchObject({ proxy: 200, page: "shown" });
    expect((await listOwn())[0].availability).toEqual({ state: "available" });
  });

  it("grace: for 14 days after the plan ends the gallery stays online, and the owner is told when it will go", async () => {
    enforce();
    await seed("g1");
    const ended = Date.now() - 3 * DAY;
    await setPlan(ended);
    expect(await visitorStatuses("g1")).toMatchObject({ proxy: 200, media: 200, page: "shown" });
    const [g] = await listOwn();
    expect(g.availability.state).toBe("grace");
    expect(g.availability.graceEndsAt).toBe(ended + 14 * DAY);
  });

  it("after the grace period every visitor route shows 'unavailable'; nothing is deleted; the owner keeps access", async () => {
    enforce();
    await seed("g1");
    await setPlan(Date.now() - 15 * DAY);
    expect(await visitorStatuses("g1")).toEqual(ALL_REFUSED);
    expect((await listOwn())[0].availability).toEqual({ state: "unavailable", reason: "lapsed" });
    expect((await proxied("g1", "owner-token")).status).toBe(200);
    expect((await testDb().collection("galleries").doc("g1").get()).exists).toBe(true);
  });

  it("renewing restores every gallery immediately", async () => {
    enforce();
    await seed("g1");
    await setPlan(Date.now() - 40 * DAY);
    expect((await visitorStatuses("g1")).proxy).toBe(404);
    await setPlan(Date.now() + 30 * DAY); // no cache to clear: a plan that is not active is never cached
    expect(await visitorStatuses("g1")).toMatchObject({ proxy: 200, media: 200, page: "shown" });
    expect((await listOwn())[0].availability).toEqual({ state: "available" });
  });

  it("an owner with no recorded expiry, a lifetime owner and the administrator are never taken offline", async () => {
    enforce();
    await seed("g1");
    await setPlan(null);
    expect((await visitorStatuses("g1")).proxy).toBe(200);
    forgetOwnerPlan();
    await setPlan(32_503_680_000_000);
    expect((await visitorStatuses("g1")).proxy).toBe(200);
    forgetOwnerPlan();
    await seed("boss1", { photographerId: "boss" });
    await testDb().collection("users").doc("boss").set({ subscriptionStatus: "expired", subscriptionExpiresAt: 1 });
    expect((await visitorStatuses("boss1")).proxy).toBe(200);
  });

  it("the gallery's own expiry still applies when enforcement is off, and an expired gallery is 'expired', not 'lapsed'", async () => {
    await seed("g1", { expiresAt: Date.now() - 1000 });
    expect((await listOwn())[0].availability).toEqual({ state: "unavailable", reason: "expired" });
  });

  it("the subscription endpoint tells the dashboard whether lapse is enforced and the grace length", async () => {
    const get = async () => (await (await subscription.GET(owner("http://localhost/api/user/subscription"))).json()).lapse;
    expect(await get()).toEqual({ enforced: false, graceDays: 14 });
    enforce();
    expect(await get()).toEqual({ enforced: true, graceDays: 14 });
  });

  it("a password-protected gallery cannot be unlocked once it is offline", async () => {
    enforce();
    await seed("g1", { visibility: "private", passwordHash: await hashPassword("secret") });
    await setPlan(Date.now() - 20 * DAY);
    expect((await visitorStatuses("g1")).verify).toBe(404);
  });
});
