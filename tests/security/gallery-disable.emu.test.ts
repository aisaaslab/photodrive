/** S7-06: an administrator can turn a gallery off. Every public way to reach it refuses, nothing is deleted, turning it on restores it, and it is audited. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
const listing = vi.hoisted(() => vi.fn());
vi.mock("@/lib/drive/client", () => ({ fetchDriveFolder: listing }));

const media = await import("@/app/api/g/[galleryId]/media/[token]/route");
const proxy = await import("@/app/api/photos/proxy/route");
const selection = await import("@/app/api/galleries/[id]/selection/route");
const submit = await import("@/app/api/galleries/[id]/selection/submit/route");
const downloadAll = await import("@/app/api/galleries/[id]/download-all/route");
const verifyPassword = await import("@/app/api/gallery/verify-password/route");
const status = await import("@/app/api/admin/galleries/[id]/status/route");
const list = await import("@/app/api/admin/galleries/route");
const { signedMediaUrl } = await import("@/lib/server/media-token");
const { hashPassword } = await import("@/lib/gallery/password");

const FILE = "drive_file-1";
let n = 0;
const ip = () => ({ "x-real-ip": `198.51.100.${++n % 250}` });
const seed = (id: string, extra: Record<string, unknown> = {}) =>
  testDb().collection("galleries").doc(id).set({ photographerId: "owner", name: id, slug: id, folderId: `folder-${id}`, createdAt: 1000 + n++, ...extra });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const as = (token: string, url: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) =>
  new NextRequest(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) } });
const setStatus = (id: string, body: unknown, token = "boss-token") => status.POST(as(token, `http://localhost/api/admin/galleries/${id}/status`, { method: "POST", body: JSON.stringify(body) }), ctx(id));
const audit = async () => (await testDb().collection("audit_log").get()).docs.map((d) => d.data()).sort((a, b) => a.at - b.at);

const thumb = (g: string) => {
  const url = new URL(signedMediaUrl(g, FILE, "thumb"), "http://localhost");
  const [, , , gid, , token] = url.pathname.split("/");
  return media.GET(new NextRequest(url, { headers: ip() }), { params: Promise.resolve({ galleryId: gid, token }) });
};
const proxied = (g: string, token?: string) =>
  proxy.GET(new NextRequest(`http://localhost/api/photos/proxy?g=${g}&fileId=${FILE}&size=thumb`, { headers: { ...ip(), ...(token ? { authorization: `Bearer ${token}` } : {}) } }));

beforeEach(async () => {
  vi.unstubAllGlobals(); // the previous test's fetch stand-in must not swallow the emulator reset
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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
    if (t === "boss-token") return { uid: "boss" };
    throw new Error("bad token");
  }) as never);
});

describe("a disabled gallery is refused everywhere a visitor can reach it", () => {
  it("while it is on, the same requests work; off, every one of them answers 404", async () => {
    await seed("g1", { passwordHash: await hashPassword("hunter2"), visibility: "private" });
    await seed("pub");

    expect((await thumb("pub")).status).toBe(200);
    expect((await proxied("pub")).status).toBe(200);
    expect((await selection.GET(new NextRequest("http://localhost/api/galleries/pub/selection", { headers: ip() }), ctx("pub"))).status).toBe(200);
    expect((await verifyPassword.POST(new NextRequest("http://localhost/api/gallery/verify-password", { method: "POST", headers: { "content-type": "application/json", ...ip() }, body: JSON.stringify({ slug: "g1", password: "hunter2" }) }))).status).toBe(200);

    expect((await setStatus("pub", { disabled: true, reason: "Reported by a client" })).status).toBe(200);
    expect((await setStatus("g1", { disabled: true })).status).toBe(200);

    expect((await thumb("pub")).status).toBe(404);
    expect((await proxied("pub")).status).toBe(404);
    expect((await proxied("pub", "owner-token")).status).toBe(404); // not even the owner
    expect((await proxied("pub", "boss-token")).status).toBe(404); // nor an administrator, on the public routes
    expect((await selection.GET(new NextRequest("http://localhost/api/galleries/pub/selection", { headers: ip() }), ctx("pub"))).status).toBe(404);
    expect((await submit.POST(new NextRequest("http://localhost/api/galleries/pub/selection/submit", { method: "POST", headers: { "content-type": "application/json", ...ip() }, body: JSON.stringify({ name: "Maria" }) }), ctx("pub"))).status).toBe(404);
    expect((await downloadAll.GET(new NextRequest("http://localhost/api/galleries/pub/download-all", { headers: ip() }), ctx("pub"))).status).toBe(404);
    // the right password no longer opens it
    expect((await verifyPassword.POST(new NextRequest("http://localhost/api/gallery/verify-password", { method: "POST", headers: { "content-type": "application/json", ...ip() }, body: JSON.stringify({ slug: "g1", password: "hunter2" }) }))).status).toBe(404);

    // nothing was deleted: turning it back on restores everything
    expect((await setStatus("pub", { disabled: false })).status).toBe(200);
    expect((await thumb("pub")).status).toBe(200);
    expect((await proxied("pub")).status).toBe(200);
    const g = (await testDb().collection("galleries").doc("pub").get()).data()!;
    expect(g.disabled).toBe(false);
    expect(g).not.toHaveProperty("disabledReason");
    expect(g).not.toHaveProperty("disabledAt");
  });

  it("the owner cannot turn it back on or off through their own edit endpoint", async () => {
    const { PATCH } = await import("@/app/api/galleries/[id]/route");
    await seed("mine", { disabled: true, photographerId: "owner" });
    const res = await PATCH(as("owner-token", "http://localhost/api/galleries/mine", { method: "PATCH", body: JSON.stringify({ disabled: false, name: "Renamed" }) }), ctx("mine"));
    expect(res.status).toBe(200);
    const g = (await testDb().collection("galleries").doc("mine").get()).data()!;
    expect(g.name).toBe("Renamed");
    expect(g.disabled).toBe(true);
  });
});

describe("the status endpoint", () => {
  it("refuses everyone but an administrator, and validates the request", async () => {
    await seed("g");
    expect((await status.POST(new NextRequest("http://localhost/x", { method: "POST", body: "{}" }), ctx("g"))).status).toBe(401);
    expect((await setStatus("g", { disabled: true }, "owner-token")).status).toBe(403);
    expect((await setStatus("g", { disabled: "yes" })).status).toBe(400);
    expect((await setStatus("nope", { disabled: true })).status).toBe(404);
    expect((await testDb().collection("galleries").doc("g").get()).get("disabled")).toBeUndefined();
  });

  it("records who, when and why, audits both directions, and is idempotent", async () => {
    await seed("g");
    expect(await (await setStatus("g", { disabled: true, reason: "  Copyright complaint  " })).json()).toEqual({ ok: true, changed: true });
    const g = (await testDb().collection("galleries").doc("g").get()).data()!;
    expect(g).toMatchObject({ disabled: true, disabledBy: "boss", disabledReason: "Copyright complaint" });
    expect(typeof g.disabledAt).toBe("number");
    expect(await (await setStatus("g", { disabled: true })).json()).toEqual({ ok: true, changed: false }); // already off: nothing more written
    await setStatus("g", { disabled: false });
    const entries = await audit();
    expect(entries.map((e) => [e.action, e.targetId, e.actorUid])).toEqual([["gallery.disable", "g", "boss"], ["gallery.enable", "g", "boss"]]);
    expect(entries[0]).toMatchObject({ before: { disabled: false }, after: { disabled: true, disabledReason: "Copyright complaint" }, note: "Copyright complaint" });
  });
});

describe("the admin list", () => {
  const page = async (qs = "") => (await (await list.GET(as("boss-token", `http://localhost/api/admin/galleries${qs}`))).json());

  it("pages newest first with the owner, status and no password", async () => {
    await testDb().collection("users").doc("owner").set({ name: "Olga Owner", email: "olga@example.com" });
    for (let i = 0; i < 60; i++) await seed(`gal-${String(i).padStart(2, "0")}`, { createdAt: 5000 + i, ...(i === 7 ? { allowDownload: false } : {}), ...(i === 8 ? { passwordHash: "x", passwordEnc: "secret", visibility: "private" } : {}) });
    const first = await page("?limit=25");
    expect(first.galleries).toHaveLength(25);
    expect(first.total).toBe(60);
    expect(first.galleries[0]).toMatchObject({ slug: "gal-59", owner: { uid: "owner", name: "Olga Owner", email: "olga@example.com" }, visibility: "public", allowDownload: true, disabled: false });
    const seen: string[] = first.galleries.map((g: { slug: string }) => g.slug);
    let cursor: string | null = first.nextCursor;
    while (cursor) { const p = await page(`?limit=25&cursor=${encodeURIComponent(cursor)}`); seen.push(...p.galleries.map((g: { slug: string }) => g.slug)); cursor = p.nextCursor; }
    expect(seen).toHaveLength(60);
    expect(new Set(seen).size).toBe(60);
    expect(seen).toEqual([...seen].sort().reverse());
    expect((await page("?q=gal-07")).galleries[0].allowDownload).toBe(false);
    expect((await page("?q=gal-08")).galleries[0].visibility).toBe("private");
    expect(JSON.stringify(first)).not.toMatch(/passwordHash|passwordEnc|"password"|secret/);
  });

  it("searches by link prefix, filters to the disabled ones and counts them", async () => {
    await seed("wedding-anna"); await seed("wedding-ben"); await seed("portraits");
    await setStatus("wedding-ben", { disabled: true, reason: "x" });
    expect((await page("?q=WEDD")).galleries.map((g: { slug: string }) => g.slug)).toEqual(["wedding-anna", "wedding-ben"]);
    const d = await page("?filter=disabled");
    expect(d.galleries.map((g: { slug: string }) => g.slug)).toEqual(["wedding-ben"]);
    expect(d.galleries[0]).toMatchObject({ disabled: true, disabledReason: "x" });
    expect(d.disabledCount).toBe(1);
    expect((await page("?q=wedding&filter=disabled")).galleries.map((g: { slug: string }) => g.slug)).toEqual(["wedding-ben"]);
    expect((await page("?q=port&filter=disabled")).galleries).toEqual([]);
  });

  it("refuses non-administrators, an unknown filter and a bad cursor", async () => {
    expect((await list.GET(as("owner-token", "http://localhost/api/admin/galleries"))).status).toBe(403);
    expect((await list.GET(as("boss-token", "http://localhost/api/admin/galleries?filter=x"))).status).toBe(400);
    expect((await list.GET(as("boss-token", "http://localhost/api/admin/galleries?cursor=zzz"))).status).toBe(400);
  });
});
