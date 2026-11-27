import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUCKET_MS, expiryBucket, isExpired, photoToken, resolvePhotoToken, signedMediaUrl, verifySignature,
} from "@/lib/server/media-token";

beforeEach(() => {
  vi.stubEnv("GALLERY_JWT_SECRET", "test-secret-for-gallery-tokens-0123456789");
  vi.stubEnv("MEDIA_SIGNING_SECRET", "");
});
afterEach(() => vi.unstubAllEnvs());

const parse = (url: string) => {
  const u = new URL(url, "http://x");
  const [, , , galleryId, , token] = u.pathname.split("/");
  return { galleryId, token, size: u.searchParams.get("size") as "thumb", e: Number(u.searchParams.get("e")), s: u.searchParams.get("s")! };
};

describe("photo tokens (S3-02)", () => {
  it("are opaque, stable, url-safe and do not contain the file id", () => {
    const t = photoToken("g1", "1AbCdEfGhIjKlMnOpQrStUvWxYz");
    expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(t).toBe(photoToken("g1", "1AbCdEfGhIjKlMnOpQrStUvWxYz"));
    expect(t).not.toContain("1AbCdEf");
  });

  it("differ per gallery and per file, so one gallery's token means nothing in another", () => {
    expect(photoToken("g1", "f")).not.toBe(photoToken("g2", "f"));
    expect(photoToken("g1", "f1")).not.toBe(photoToken("g1", "f2"));
  });

  it("depend on the secret", () => {
    const a = photoToken("g1", "f");
    vi.stubEnv("MEDIA_SIGNING_SECRET", "another-secret");
    expect(photoToken("g1", "f")).not.toBe(a);
  });

  it("need a secret: an unset one throws instead of signing with nothing", () => {
    vi.stubEnv("GALLERY_JWT_SECRET", "");
    expect(() => photoToken("g1", "f")).toThrow(/must be set/);
  });

  it("resolve to the file among the gallery's files, and to nothing else", () => {
    const files = [{ id: "f1" }, { id: "f2" }, { id: "f3" }];
    expect(resolvePhotoToken("g1", photoToken("g1", "f2"), files)).toBe(files[1]);
    expect(resolvePhotoToken("g1", photoToken("g1", "gone"), files)).toBeNull();
    expect(resolvePhotoToken("g2", photoToken("g1", "f2"), files)).toBeNull();
    expect(resolvePhotoToken("g1", "not-a-token", files)).toBeNull();
  });
});

describe("signed URLs", () => {
  const T0 = Date.UTC(2026, 10, 26, 10, 0, 0);

  it("verify, carry no Drive id or Drive host, and name the gallery", () => {
    const url = signedMediaUrl("g1", "driveFileId123", "thumb", T0);
    expect(url).toMatch(/^\/api\/g\/g1\/media\/[A-Za-z0-9_-]{22}\?size=thumb&e=\d+&s=[A-Za-z0-9_-]+$/);
    expect(url).not.toMatch(/driveFileId123|google/i);
    const p = parse(url);
    expect(verifySignature(p.galleryId, p.token, p.size, p.e, p.s)).toBe(true);
  });

  it("cannot be altered: another size, gallery, token, expiry or signature fails", () => {
    const p = parse(signedMediaUrl("g1", "f1", "thumb", T0));
    expect(verifySignature(p.galleryId, p.token, "full", p.e, p.s)).toBe(false);
    expect(verifySignature("g2", p.token, p.size, p.e, p.s)).toBe(false);
    expect(verifySignature(p.galleryId, photoToken("g1", "f2"), p.size, p.e, p.s)).toBe(false);
    expect(verifySignature(p.galleryId, p.token, p.size, p.e + 1, p.s)).toBe(false);
    expect(verifySignature(p.galleryId, p.token, p.size, p.e, p.s.slice(0, -1) + (p.s.endsWith("A") ? "B" : "A"))).toBe(false);
    expect(verifySignature(p.galleryId, p.token, p.size, p.e, "")).toBe(false);
    expect(verifySignature(p.galleryId, p.token, p.size, p.e, "x".repeat(200))).toBe(false);
  });

  it("are identical within a 6-hour window (cache friendly) and valid for 6 to 12 hours", () => {
    const bucketStart = Math.floor(T0 / BUCKET_MS) * BUCKET_MS;
    const early = signedMediaUrl("g1", "f1", "thumb", bucketStart);
    const late = signedMediaUrl("g1", "f1", "thumb", bucketStart + BUCKET_MS - 1);
    expect(early).toBe(late);
    expect(signedMediaUrl("g1", "f1", "thumb", bucketStart + BUCKET_MS)).not.toBe(early);

    const e = expiryBucket(bucketStart);
    expect(isExpired(e, bucketStart + 6 * 3600_000 - 1)).toBe(false);
    expect(isExpired(e, bucketStart + 12 * 3600_000 - 1)).toBe(false);
    expect(isExpired(e, bucketStart + 12 * 3600_000)).toBe(true);
    // issued at the very end of a window it still lives a full 6 hours
    expect(isExpired(expiryBucket(bucketStart + BUCKET_MS - 1), bucketStart + BUCKET_MS - 1 + 6 * 3600_000 - 1)).toBe(false);
  });

  it("a signature made with one secret does not verify with another", () => {
    const p = parse(signedMediaUrl("g1", "f1", "thumb", T0));
    vi.stubEnv("MEDIA_SIGNING_SECRET", "rotated");
    expect(verifySignature(p.galleryId, p.token, p.size, p.e, p.s)).toBe(false);
  });
});
