/** S3-02: /api/g/[galleryId]/media/[token], the signed delivery route of the protected tier. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
const listing = vi.hoisted(() => vi.fn());
vi.mock("@/lib/drive/client", () => ({ fetchDriveFolder: listing }));

const { GET } = await import("@/app/api/g/[galleryId]/media/[token]/route");
const { signedMediaUrl, photoToken, BUCKET_MS } = await import("@/lib/server/media-token");
const { signGalleryToken } = await import("@/lib/gallery/session");
const { getRateLimiter } = await import("@/lib/server/rate-limit");

const FILE = "drive_file-1";
let n = 0;
let upstream: ReturnType<typeof vi.fn>;

/** Requests a signed URL (as the page would have issued it), with optional tampering. */
const fetchMedia = (
  galleryId: string,
  fileId: string,
  size: "thumb" | "preview" | "full" | "stream",
  opts: { headers?: Record<string, string>; cookie?: string; edit?: (u: URL) => void; now?: number; ip?: string } = {},
) => {
  const url = new URL(signedMediaUrl(galleryId, fileId, size, opts.now), "http://localhost");
  opts.edit?.(url);
  const [, , , g, , token] = url.pathname.split("/");
  return GET(
    new NextRequest(url, { headers: { "x-real-ip": opts.ip ?? `198.51.100.${++n % 250}`, ...(opts.cookie ? { cookie: opts.cookie } : {}), ...opts.headers } }),
    { params: Promise.resolve({ galleryId: g, token }) },
  );
};
const seed = (id: string, extra: Record<string, unknown> = {}) =>
  testDb().collection("galleries").doc(id).set({ photographerId: "owner", name: id, slug: id, folderId: `folder-${id}`, createdAt: 1, ...extra });
const cookieFor = async (id: string, v = 0) => `gallery_token_${id}=${await signGalleryToken(id, v)}`;

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
  listing.mockReset().mockResolvedValue({ files: [{ id: FILE, mimeType: "image/jpeg" }, { id: "other-file", mimeType: "image/jpeg" }], subfolders: [] });
  upstream = vi.fn(async () => new Response("bytes", { status: 200, headers: { "content-type": "image/jpeg", "content-length": "5" } }));
  vi.stubGlobal("fetch", upstream);
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async (t: string) => {
    if (t === "owner-token") return { uid: "owner" };
    if (t === "boss-token") return { uid: "boss" };
    throw new Error("bad token");
  }) as never);
});

describe("a valid signed request", () => {
  it("streams the bytes of the file the token stands for (the token resolves inside the gallery's folder)", async () => {
    await seed("g1", { allowDownload: false });
    const res = await fetchMedia("g1", FILE, "thumb");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("bytes");
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(String(upstream.mock.calls[0][0])).toContain(`id=${FILE}&sz=w800`);
    expect(listing).toHaveBeenCalledWith("folder-g1");
    expect(String(upstream.mock.calls[0][0])).not.toContain("test-key"); // thumbnails use no API key
  });

  it("previews use the larger size", async () => {
    await seed("g1", { allowDownload: false });
    expect((await fetchMedia("g1", FILE, "preview")).status).toBe(200);
    expect(String(upstream.mock.calls[0][0])).toContain("sz=w2048");
  });

  it("public gallery: cached for a limited time (shorter than the link lives); private: never in a shared cache", async () => {
    await seed("pub", { allowDownload: false });
    await seed("priv", { visibility: "private", passwordHash: "x", pwChangedAt: 0 });
    expect((await fetchMedia("pub", FILE, "thumb")).headers.get("cache-control")).toBe("public, max-age=3600");
    expect((await fetchMedia("priv", FILE, "thumb", { cookie: await cookieFor("priv") })).headers.get("cache-control")).toBe("private, max-age=3600");
  });

  it("works for a live demo", async () => {
    await testDb().collection("demo_galleries").doc("d1").set({ folderId: "folder-d1", createdAt: 1, expiresAt: Date.now() + 60_000 });
    expect((await fetchMedia("d1", FILE, "thumb")).status).toBe(200);
  });
});

describe("denied: the link itself", () => {
  it("malformed parameters are 400 and Google is never asked", async () => {
    await seed("g1");
    const edits: ((u: URL) => void)[] = [
      (u) => u.searchParams.delete("size"),
      (u) => u.searchParams.set("size", "huge"),
      (u) => u.searchParams.delete("e"),
      (u) => u.searchParams.set("e", "abc"),
      (u) => u.searchParams.delete("s"),
      (u) => u.searchParams.set("s", "x".repeat(100)),
    ];
    for (const edit of edits) expect((await fetchMedia("g1", FILE, "thumb", { edit })).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("a forged or altered signature is 403", async () => {
    await seed("g1");
    const bad: ((u: URL) => void)[] = [
      (u) => u.searchParams.set("s", "AAAAAAAAAAAAAAAAAAAAAA"),
      (u) => u.searchParams.set("size", "full"), // asking for the original with a thumbnail's signature
      (u) => u.searchParams.set("e", String(Number(u.searchParams.get("e")) + 100)), // extending the life of the link
      (u) => (u.pathname = u.pathname.replace(/[^/]+$/, photoToken("g1", "other-file"))), // another photo, same signature
    ];
    for (const edit of bad) expect((await fetchMedia("g1", FILE, "thumb", { edit })).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("a link made for another gallery cannot be replayed on this one", async () => {
    await seed("g1");
    await seed("g2");
    const res = await GET(new NextRequest(new URL(signedMediaUrl("g1", FILE, "thumb"), "http://localhost").toString().replace("/g/g1/", "/g/g2/"), { headers: { "x-real-ip": "198.51.100.200" } }), {
      params: Promise.resolve({ galleryId: "g2", token: photoToken("g1", FILE) }),
    });
    expect(res.status).toBe(403);
  });

  it("an expired link is 410 (not 403), from 12 hours after it was issued at the latest", async () => {
    await seed("g1");
    const issued = Date.now() - 13 * 3600_000;
    expect((await fetchMedia("g1", FILE, "thumb", { now: issued })).status).toBe(410);
    expect((await fetchMedia("g1", FILE, "thumb", { now: Date.now() - 5 * 3600_000 })).status).toBe(200);
    expect(BUCKET_MS).toBe(6 * 3600_000);
  });

  it("a link signed with a different secret is refused (rotation invalidates old links)", async () => {
    await seed("g1");
    const url = signedMediaUrl("g1", FILE, "thumb");
    vi.stubEnv("MEDIA_SIGNING_SECRET", "rotated");
    const res = await GET(new NextRequest(new URL(url, "http://localhost"), { headers: { "x-real-ip": "198.51.100.201" } }), { params: Promise.resolve({ galleryId: "g1", token: url.split("/")[5].split("?")[0] }) });
    expect(res.status).toBe(403);
  });
});

describe("denied: the gallery", () => {
  it("an unknown gallery or an expired demo is 404", async () => {
    await testDb().collection("demo_galleries").doc("old").set({ folderId: "f", createdAt: 1, expiresAt: Date.now() - 1000 });
    expect((await fetchMedia("nope", FILE, "thumb")).status).toBe(404);
    expect((await fetchMedia("old", FILE, "thumb")).status).toBe(404);
  });

  it("a validly signed token whose photo is no longer in the folder is 404", async () => {
    await seed("g1");
    expect((await fetchMedia("g1", "deleted-from-drive", "thumb")).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("fails closed when Drive's listing cannot be read: 502, no bytes", async () => {
    await seed("g1");
    listing.mockRejectedValue(new Error("down"));
    expect((await fetchMedia("g1", FILE, "thumb")).status).toBe(502);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("private galleries", () => {
  beforeEach(() => seed("g1", { visibility: "private", passwordHash: "x", pwChangedAt: 5 }));

  it("every size needs the visitor's unlock cookie, for this gallery and the current password version", async () => {
    for (const size of ["thumb", "preview", "full"] as const) {
      expect((await fetchMedia("g1", FILE, size)).status, `${size} without cookie`).toBe(401);
      expect((await fetchMedia("g1", FILE, size, { cookie: await cookieFor("g1", 4) })).status, `${size} after a password change`).toBe(401);
      expect((await fetchMedia("g1", FILE, size, { cookie: "gallery_token_g1=garbage" })).status, `${size} garbage cookie`).toBe(401);
    }
    await seed("g2", { visibility: "private", passwordHash: "x" });
    expect((await fetchMedia("g1", FILE, "thumb", { cookie: `gallery_token_g1=${await signGalleryToken("g2", 5)}` })).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
    expect((await fetchMedia("g1", FILE, "thumb", { cookie: await cookieFor("g1", 5) })).status).toBe(200);
    expect((await fetchMedia("g1", FILE, "full", { cookie: await cookieFor("g1", 5) })).status).toBe(200);
  });

  it("the owner and administrators do not need the cookie", async () => {
    expect((await fetchMedia("g1", FILE, "thumb", { headers: { authorization: "Bearer owner-token" } })).status).toBe(200);
    expect((await fetchMedia("g1", FILE, "full", { headers: { authorization: "Bearer boss-token" } })).status).toBe(200);
    expect((await fetchMedia("g1", FILE, "thumb", { headers: { authorization: "Bearer bad" } })).status).toBe(401);
  });
});

describe("downloads turned off", () => {
  beforeEach(() => seed("g1", { allowDownload: false }));

  it("originals are 403 for visitors, thumbnails and previews are fine", async () => {
    expect((await fetchMedia("g1", FILE, "full")).status).toBe(403);
    expect((await fetchMedia("g1", FILE, "thumb")).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("the owner and administrators can still fetch originals; Range is forwarded for seeking", async () => {
    upstream.mockImplementationOnce(async () => new Response("part", { status: 206, headers: { "content-range": "bytes 0-3/10", "content-type": "video/mp4" } }));
    const res = await fetchMedia("g1", FILE, "full", { headers: { authorization: "Bearer owner-token", range: "bytes=0-3" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-3/10");
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(upstream.mock.calls[0][1]).toEqual({ headers: { Range: "bytes=0-3" } });
    expect((await fetchMedia("g1", FILE, "full", { headers: { authorization: "Bearer boss-token" } })).status).toBe(200);
  });
});

describe("video playback (size=stream)", () => {
  it("plays in a gallery with downloads off (it is not a download), seeks with Range, and is never cached by shared caches", async () => {
    await seed("g1", { allowDownload: false });
    upstream.mockImplementationOnce(async () => new Response("part", { status: 206, headers: { "content-range": "bytes 0-3/10", "content-type": "video/mp4" } }));
    const res = await fetchMedia("g1", FILE, "stream", { headers: { range: "bytes=0-3" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-3/10");
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(upstream.mock.calls[0][1]).toEqual({ headers: { Range: "bytes=0-3" } });
    expect(String(upstream.mock.calls[0][0])).toContain("alt=media");
  });

  it("a private gallery still needs the unlock cookie, and a stream link cannot be turned into a download link", async () => {
    await seed("g1", { visibility: "private", passwordHash: "x", pwChangedAt: 1 });
    expect((await fetchMedia("g1", FILE, "stream")).status).toBe(401);
    expect((await fetchMedia("g1", FILE, "stream", { cookie: await cookieFor("g1", 1) })).status).toBe(200);
    await seed("g2", { allowDownload: false });
    expect((await fetchMedia("g2", FILE, "stream", { edit: (u) => u.searchParams.set("size", "full") })).status).toBe(403); // signature covers the size
  });
});

describe("rate limits", () => {
  it("views and originals are limited per visitor, separately, with Retry-After", async () => {
    await seed("g1", { allowDownload: true });
    const ip = "203.0.113.99";
    const limiter = getRateLimiter();
    for (let i = 0; i < 900; i++) await limiter.limit({ name: "media-view", id: ip, limit: 900, windowSec: 60 });
    const blocked = await fetchMedia("g1", FILE, "thumb", { ip });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await fetchMedia("g1", FILE, "full", { ip })).status).toBe(200);
  });
});
