/** S3-03: what the browser receives for a protected gallery, and the selection API behind it. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
const listing = vi.hoisted(() => vi.fn());
vi.mock("@/lib/drive/client", () => ({ fetchDriveFolder: listing }));
const jar = vi.hoisted(() => ({ cookies: {} as Record<string, string> }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name in jar.cookies ? { name, value: jar.cookies[name] } : undefined) }),
}));

const { default: GalleryPage } = await import("@/app/gallery/[slug]/page");
const { GET: getSelection, POST: toggle } = await import("@/app/api/galleries/[id]/selection/route");
const { signGalleryToken } = await import("@/lib/gallery/session");
const { photoToken } = await import("@/lib/server/media-token");
const { toProtectedFolders, toProtectedPhotos, usesProtectedTier } = await import("@/lib/server/protected-photos");

const IMG = "1DriveImageFileIdAAAAAAAAAAAAAAAAAAA";
const IMG2 = "1DriveImageFileIdBBBBBBBBBBBBBBBBBBB";
const VID = "1DriveVideoFileIdCCCCCCCCCCCCCCCCCCC";
const FOLDER = "1DriveFolderIdDDDDDDDDDDDDDDDDDDDDDD";
const SUB = "1DriveSubfolderIdEEEEEEEEEEEEEEEEEEE";
const files = [
  { id: IMG, name: "a.jpg", mimeType: "image/jpeg", width: 100, height: 80, thumbnailLink: `https://lh3.googleusercontent.com/${IMG}-secret=s220` },
  { id: IMG2, name: "b.jpg", mimeType: "image/jpeg", thumbnailLink: "https://lh3.googleusercontent.com/zzz=s220", folder: "Sub" },
  { id: VID, name: "c.mp4", mimeType: "video/mp4", thumbnailLink: "https://lh3.googleusercontent.com/vvv=s220" },
];
const subfolders = [{ id: SUB, name: "Sub", path: "Sub" }];
const DRIVE_IDS = [IMG, IMG2, VID, FOLDER, SUB];

const seed = (id: string, extra: Record<string, unknown> = {}) =>
  testDb().collection("galleries").doc(id).set({
    photographerId: "owner", name: `Gallery ${id}`, slug: id, folderId: FOLDER, createdAt: 1, coverFileId: IMG, ...extra,
  });

/** Everything the page hands to the browser: the props of every element it renders, as text. */
async function pagePayload(slug: string): Promise<string> {
  const tree = await GalleryPage({ params: Promise.resolve({ slug }) });
  // React's own bookkeeping on each element (`_owner`, `_store`, ...) is not sent to the browser; repeated objects are cut so cycles end.
  const seen = new WeakSet<object>();
  return JSON.stringify(tree, (k, v) => {
    if (k.startsWith("_") || typeof v === "function" || typeof v === "symbol") return undefined;
    if (v && typeof v === "object") {
      if (seen.has(v)) return undefined;
      seen.add(v);
    }
    return v;
  });
}
const leaks = (text: string) => [...DRIVE_IDS, "googleusercontent", "drive.usercontent", "drive.google", "lh3."].filter((needle) => text.includes(needle));

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("GALLERY_JWT_SECRET", "test-secret-for-gallery-tokens-0123456789");
  vi.stubEnv("ADMIN_UID", "boss");
  vi.stubEnv("MEDIA_PROTECTED_TIER", "1");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  jar.cookies = {};
  listing.mockReset().mockResolvedValue({ files, subfolders });
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async (t: string) => {
    if (t === "owner-token") return { uid: "owner" };
    throw new Error("bad token");
  }) as never);
});

describe("builders", () => {
  it("toProtectedPhotos swaps ids for tokens, drops Google links and adds only the URLs the gallery allows", () => {
    const out = toProtectedPhotos("g1", files, false);
    expect(out.map((p) => p.id)).toEqual(files.map((f) => photoToken("g1", f.id)));
    const text = JSON.stringify(out);
    expect(leaks(text)).toEqual([]);
    expect(out[0]).toMatchObject({ name: "a.jpg", mimeType: "image/jpeg", width: 100, height: 80 });
    expect(out[1].folder).toBe("Sub");
    expect(out[0].urls).toEqual({ thumb: expect.stringMatching(/size=thumb/), preview: expect.stringMatching(/size=preview/) });
    expect(out[2].urls?.stream).toMatch(/size=stream/); // videos can play
    expect(out[0].urls?.stream).toBeUndefined();
    expect(JSON.stringify(toProtectedPhotos("g1", files, true)[0].urls)).toContain("size=full");
  });

  it("folders keep their names but lose their Drive ids", () => {
    expect(toProtectedFolders("g1", subfolders)).toEqual([{ id: photoToken("g1", `folder:${SUB}`), name: "Sub", path: "Sub" }]);
  });

  it("the tier is off without the flag and for public galleries with downloads on", () => {
    expect(usesProtectedTier({ private: true, allowDownload: true })).toBe(true);
    expect(usesProtectedTier({ private: false, allowDownload: false })).toBe(true);
    expect(usesProtectedTier({ private: false, allowDownload: true })).toBe(false);
    vi.stubEnv("MEDIA_PROTECTED_TIER", "0");
    expect(usesProtectedTier({ private: true, allowDownload: false })).toBe(false);
  });
});

describe("the gallery page", () => {
  it("private gallery, unlocked: no Drive id and no Google URL anywhere in what the browser receives", async () => {
    await seed("priv", { visibility: "private", passwordHash: "x", pwChangedAt: 3 });
    jar.cookies["gallery_token_priv-id"] = "";
    const doc = (await testDb().collection("galleries").where("slug", "==", "priv").get()).docs[0];
    jar.cookies[`gallery_token_${doc.id}`] = await signGalleryToken(doc.id, 3);
    const text = await pagePayload("priv");
    expect(text).toContain("/api/g/");
    expect(text).toContain(photoToken(doc.id, IMG)); // the tokens are there
    expect(leaks(text)).toEqual([]);
  });

  it("public gallery with downloads off: the same, and no original URLs", async () => {
    await seed("nodl", { allowDownload: false });
    const text = await pagePayload("nodl");
    expect(leaks(text)).toEqual([]);
    expect(text).not.toContain("size=full");
    expect(text).toContain("size=thumb");
  });

  it("a locked private gallery sends the password gate and no photo data at all", async () => {
    await seed("locked", { visibility: "private", passwordHash: "x" });
    const text = await pagePayload("locked");
    expect(leaks(text)).toEqual([]);
    expect(text).not.toContain("/api/g/");
    expect(listing).not.toHaveBeenCalled();
  });

  it("public gallery with downloads on keeps Google-CDN delivery, exactly as before", async () => {
    await seed("pub");
    const text = await pagePayload("pub");
    expect(text).toContain(IMG);
    expect(text).toContain("googleusercontent");
    expect(text).not.toContain("/api/g/");
  });

  it("without MEDIA_PROTECTED_TIER nothing changes, even for a private gallery", async () => {
    vi.stubEnv("MEDIA_PROTECTED_TIER", "");
    await seed("priv2", { visibility: "private", passwordHash: "x", pwChangedAt: 0 });
    const doc = (await testDb().collection("galleries").where("slug", "==", "priv2").get()).docs[0];
    jar.cookies[`gallery_token_${doc.id}`] = await signGalleryToken(doc.id, 0);
    const text = await pagePayload("priv2");
    expect(text).toContain(IMG);
    expect(text).not.toContain("/api/g/");
  });
});

describe("favourites (selection API)", () => {
  const call = (method: "GET" | "POST", id: string, opts: { body?: unknown; cookie?: string; bearer?: string } = {}) => {
    const req = new NextRequest(`http://localhost/api/galleries/${id}/selection`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
        ...(opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}),
      },
      ...(method === "POST" ? { body: JSON.stringify(opts.body) } : {}),
    });
    return (method === "GET" ? getSelection : toggle)(req, { params: Promise.resolve({ id }) });
  };
  const stored = async (id: string) => (await testDb().collection("gallery_selections").doc(id).get()).data();

  it("protected tier: the visitor sends a token, the real file id is stored, and the visitor gets tokens back", async () => {
    await seed("nodl", { allowDownload: false });
    const token = photoToken("nodl", IMG);
    expect((await call("POST", "nodl", { body: { action: "add", item: { id: token, name: "a.jpg" } } })).status).toBe(200);
    expect((await stored("nodl"))!.items).toEqual([{ id: IMG, name: "a.jpg" }]); // the owner's data is real ids

    const visitor = await (await call("GET", "nodl")).json();
    expect(visitor.photos).toEqual([{ id: token, name: "a.jpg" }]);
    expect(JSON.stringify(visitor)).not.toContain(IMG);

    const owner = await (await call("GET", "nodl", { bearer: "owner-token" })).json();
    expect(owner.photos).toEqual([{ id: IMG, name: "a.jpg" }]); // the dashboard still gets real ids

    expect((await call("POST", "nodl", { body: { action: "remove", item: { id: token } } })).status).toBe(200);
    expect((await stored("nodl"))!.items).toEqual([]);
  });

  it("protected tier: a token that is not a photo of this gallery is refused and nothing is stored", async () => {
    await seed("nodl", { allowDownload: false });
    await seed("other", { allowDownload: false });
    for (const id of [photoToken("other", IMG), photoToken("nodl", "not-in-folder"), IMG, "garbage"]) {
      expect((await call("POST", "nodl", { body: { action: "add", item: { id, name: "x" } } })).status, id).toBe(404);
    }
    expect(await stored("nodl")).toBeUndefined();
  });

  it("a private gallery's favourites need the unlock cookie (before, anyone could read and edit them)", async () => {
    await seed("priv", { visibility: "private", passwordHash: "x", pwChangedAt: 2 });
    const cookie = `gallery_token_priv=${await signGalleryToken("priv", 2)}`;
    const stale = `gallery_token_priv=${await signGalleryToken("priv", 1)}`;
    const add = { body: { action: "add", item: { id: photoToken("priv", IMG), name: "a.jpg" } } };
    expect((await call("GET", "priv")).status).toBe(401);
    expect((await call("POST", "priv", add)).status).toBe(401);
    expect((await call("GET", "priv", { cookie: stale })).status).toBe(401);
    expect(await stored("priv")).toBeUndefined();
    expect((await call("POST", "priv", { ...add, cookie })).status).toBe(200);
    expect((await call("GET", "priv", { cookie })).status).toBe(200);
    expect((await call("GET", "priv", { bearer: "owner-token" })).status).toBe(200); // the owner needs no cookie
  });

  it("public tier is unchanged: real ids in, real ids out, no cookie", async () => {
    await seed("pub");
    expect((await call("POST", "pub", { body: { action: "add", item: { id: IMG, name: "a.jpg" } } })).status).toBe(200);
    expect((await (await call("GET", "pub")).json()).photos).toEqual([{ id: IMG, name: "a.jpg" }]);
  });

  it("an unknown gallery is 404", async () => {
    expect((await call("GET", "nope")).status).toBe(404);
    expect((await call("POST", "nope", { body: { action: "add", item: { id: "x" } } })).status).toBe(404);
  });
});
