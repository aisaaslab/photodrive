/** S3-04: /api/photos/proxy only serves files of the gallery it is asked about, and originals need permission. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
const listing = vi.hoisted(() => vi.fn());
vi.mock("@/lib/drive/client", () => ({ fetchDriveFolder: listing }));

const { GET } = await import("@/app/api/photos/proxy/route");
const { signGalleryToken } = await import("@/lib/gallery/session");
const { getRateLimiter } = await import("@/lib/server/rate-limit");

const MINE = "mine_file-1";
const SUB = "mine_in-subfolder";
const FOREIGN = "someone_elses-file";
let n = 0;
let upstream: ReturnType<typeof vi.fn>;

const get = (query: Record<string, string | undefined>, headers: Record<string, string> = {}, cookie?: string) => {
  const url = new URL("http://localhost/api/photos/proxy");
  for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
  return GET(new NextRequest(url, { headers: { "x-real-ip": `198.51.100.${++n % 250}`, ...(cookie ? { cookie } : {}), ...headers } }));
};
const photo = (g: string, fileId = MINE, size = "thumb", headers: Record<string, string> = {}, cookie?: string) =>
  get({ g, fileId, size }, headers, cookie);

async function seed(id: string, extra: Record<string, unknown> = {}) {
  await testDb().collection("galleries").doc(id).set({ photographerId: "owner", name: id, slug: id, folderId: `folder-${id}`, createdAt: 1, ...extra });
}

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("GOOGLE_DRIVE_API_KEY", "test-key");
  vi.stubEnv("GALLERY_JWT_SECRET", "test-secret-for-gallery-tokens-0123456789");
  vi.stubEnv("ADMIN_UID", "boss");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  listing.mockReset().mockResolvedValue({ files: [{ id: MINE }, { id: SUB, folder: "Sub" }], subfolders: [] });
  upstream = vi.fn(async () => new Response("bytes", { status: 200, headers: { "content-type": "image/jpeg", "content-length": "5" } }));
  vi.stubGlobal("fetch", upstream);
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async (t: string) => {
    if (t === "owner-token") return { uid: "owner" };
    if (t === "boss-token") return { uid: "boss" };
    if (t === "other-token") return { uid: "other" };
    throw new Error("bad token");
  }) as never);
});

describe("parameters", () => {
  it("needs a gallery id, a valid file id and a known size", async () => {
    await seed("g1");
    for (const q of [{ fileId: MINE }, { g: "g1" }, { g: "g1", fileId: "../x" }, { g: "g 1", fileId: MINE }, { g: "g1", fileId: MINE, size: "huge" }]) {
      expect((await get(q)).status, JSON.stringify(q)).toBe(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("an unknown gallery is 404", async () => {
    expect((await photo("nope")).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("folder membership", () => {
  it("a file that is not in the gallery's folder is refused, for every size, and Google is never asked", async () => {
    await seed("g1");
    for (const size of ["thumb", "preview", "full"]) expect((await photo("g1", FOREIGN, size, { authorization: "Bearer owner-token" })).status, size).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
    expect(listing).toHaveBeenCalledWith("folder-g1"); // checked against this gallery's own folder
  });

  it("files of the folder and of its subfolders are served", async () => {
    await seed("g1");
    expect((await photo("g1", MINE)).status).toBe(200);
    expect((await photo("g1", SUB, "preview")).status).toBe(200);
    expect(String(upstream.mock.calls[0][0])).toContain(`id=${MINE}&sz=w800`);
    expect(String(upstream.mock.calls[1][0])).toContain(`id=${SUB}&sz=w2048`);
  });

  it("another gallery's id cannot be used to reach a file", async () => {
    await seed("g1");
    await seed("g2");
    listing.mockImplementation(async (folder: string) => ({ files: folder === "folder-g1" ? [{ id: MINE }] : [{ id: "g2-file" }], subfolders: [] }));
    expect((await photo("g2", MINE)).status).toBe(403);
    expect((await photo("g2", "g2-file")).status).toBe(200);
  });

  it("fails closed when Drive cannot be read: 502 and no bytes", async () => {
    await seed("g1");
    listing.mockRejectedValue(new Error("drive down"));
    expect((await photo("g1")).status).toBe(502);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("thumbnails and previews", () => {
  it("public gallery: cached publicly", async () => {
    await seed("g1");
    const res = await photo("g1");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("public");
  });

  it("private gallery: served without the cookie (the images are on Google's public CDN anyway) but never in a shared cache", async () => {
    await seed("g1", { visibility: "private", passwordHash: "x" });
    const res = await photo("g1");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
  });
});

describe("originals (size=full)", () => {
  const cookieFor = async (id: string, v = 0) => `gallery_token_${id}=${await signGalleryToken(id, v)}`;

  it("public gallery with downloads on: served, never in a shared cache", async () => {
    await seed("g1");
    const res = await photo("g1", MINE, "full");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(await res.text()).toBe("bytes");
  });

  it("downloads turned off: 403 for visitors, even with the unlock cookie", async () => {
    await seed("g1", { allowDownload: false, passwordHash: "x", pwChangedAt: 5 });
    expect((await photo("g1", MINE, "full")).status).toBe(403);
    expect((await photo("g1", MINE, "full", {}, await cookieFor("g1", 5))).status).toBe(403);
    expect((await photo("g1", MINE, "full", { authorization: "Bearer other-token" })).status).toBe(403); // someone else's account is not the owner
    expect(upstream).not.toHaveBeenCalled();
  });

  it("private gallery: needs the unlock cookie for THIS gallery and the current password version", async () => {
    await seed("g1", { visibility: "private", passwordHash: "x", pwChangedAt: 5 });
    await seed("g2", { visibility: "private", passwordHash: "x", pwChangedAt: 0 });
    expect((await photo("g1", MINE, "full")).status).toBe(401); // no cookie
    expect((await photo("g1", MINE, "full", {}, await cookieFor("g1", 4))).status).toBe(401); // password changed since
    expect((await photo("g1", MINE, "full", {}, `gallery_token_g1=${await signGalleryToken("g2", 5)}`)).status).toBe(401); // token of another gallery
    expect((await photo("g1", MINE, "full", {}, "gallery_token_g1=garbage")).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
    expect((await photo("g1", MINE, "full", {}, await cookieFor("g1", 5))).status).toBe(200);
  });

  it("the owner and administrators can always fetch originals (a signed-in bearer token)", async () => {
    await seed("g1", { allowDownload: false, visibility: "private", passwordHash: "x" });
    expect((await photo("g1", MINE, "full", { authorization: "Bearer owner-token" })).status).toBe(200);
    expect((await photo("g1", MINE, "full", { authorization: "Bearer boss-token" })).status).toBe(200);
    expect((await photo("g1", MINE, "full", { authorization: "Bearer bad" })).status).toBe(403);
  });

  it("forwards Range so videos can seek", async () => {
    await seed("g1");
    upstream.mockResolvedValue(new Response("part", { status: 206, headers: { "content-range": "bytes 0-3/10", "content-type": "video/mp4" } }));
    const res = await photo("g1", MINE, "full", { range: "bytes=0-3" });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-3/10");
    expect(upstream.mock.calls[0][1]).toEqual({ headers: { Range: "bytes=0-3" } });
  });
});

describe("demo galleries", () => {
  it("a live demo's files are served; an expired demo is 404", async () => {
    await testDb().collection("demo_galleries").doc("d1").set({ folderId: "folder-d1", createdAt: 1, expiresAt: Date.now() + 60_000 });
    await testDb().collection("demo_galleries").doc("d2").set({ folderId: "folder-d2", createdAt: 1, expiresAt: Date.now() - 1000 });
    expect((await photo("d1")).status).toBe(200);
    expect((await photo("d2")).status).toBe(404);
  });
});

describe("rate limiting", () => {
  it("views and originals are limited per visitor with Retry-After, and limits are separate", async () => {
    await seed("g1");
    const ip = "203.0.113.77";
    const limiter = getRateLimiter();
    for (let i = 0; i < 900; i++) await limiter.limit({ name: "photo-view", id: ip, limit: 900, windowSec: 60 });
    const req = (size: string) => GET(new NextRequest(`http://localhost/api/photos/proxy?g=g1&fileId=${MINE}&size=${size}`, { headers: { "x-real-ip": ip } }));
    const blocked = await req("thumb");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await req("full")).status).toBe(200); // originals have their own allowance
  });
});
