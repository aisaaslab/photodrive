import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * Opaque photo tokens and signed media URLs for the protected delivery tier (S3-02, decision D15 option A).
 *
 * - A **photo token** stands in for a Drive file id in what the client receives. It is `HMAC(secret, galleryId:fileId)`, so it
 *   cannot be reversed or guessed, is stable for a photo (cache friendly), and is only meaningful inside one gallery.
 *   The server turns a token back into a file id by looking it up among the files of the gallery's own folder.
 * - A **signed URL** is `/api/g/{galleryId}/media/{token}?size=…&e={bucket}&s={signature}`. The signature covers the gallery, the
 *   token, the size and the expiry bucket, so none of them can be changed. `e` is a 6-hour bucket number: every URL issued in the
 *   same window is identical (so browsers and CDNs can cache) and each one is valid for 6 to 12 hours.
 *
 * Signing is not authorisation: private galleries still need the unlock cookie and originals still need downloads turned on;
 * the route checks those. A signature only proves the URL was issued by this server for this photo and has not expired.
 */

export const BUCKET_MS = 6 * 60 * 60 * 1000;
/**
 * thumb / preview: images. full: the original, for downloads (needs downloads turned on). stream: the original for playing in the
 * page (video), which needs no download permission but is otherwise checked the same way and supports Range.
 */
export type MediaSize = "thumb" | "preview" | "full" | "stream";
export const MEDIA_SIZES: readonly MediaSize[] = ["thumb", "preview", "full", "stream"];

const TOKEN_BYTES = 16; // 128 bits, 22 characters
const SIG_BYTES = 16;

let derived: { from: string; key: Buffer } | null = null;

/** `MEDIA_SIGNING_SECRET`, or else a key derived (HKDF) from `GALLERY_JWT_SECRET` so no new secret has to be set up. */
function key(): Buffer {
  const own = process.env.MEDIA_SIGNING_SECRET;
  if (own) return Buffer.from(own, "utf8");
  const base = process.env.GALLERY_JWT_SECRET;
  if (!base) throw new Error("MEDIA_SIGNING_SECRET or GALLERY_JWT_SECRET must be set");
  if (derived?.from !== base) {
    derived = { from: base, key: Buffer.from(hkdfSync("sha256", base, "photodrive", "media-signing-v1", 32)) };
  }
  return derived.key;
}

const mac = (purpose: string, data: string, bytes: number) =>
  createHmac("sha256", key()).update(`${purpose}\n${data}`).digest().subarray(0, bytes).toString("base64url");

/** The opaque stand-in for a Drive file id, within one gallery. */
export function photoToken(galleryId: string, fileId: string): string {
  return mac("photo", `${galleryId}\n${fileId}`, TOKEN_BYTES);
}

/** The file whose token this is, among the gallery's files; null when none matches (deleted, or never in this gallery). */
export function resolvePhotoToken<T extends { id: string }>(galleryId: string, token: string, files: readonly T[]): T | null {
  for (const f of files) if (photoToken(galleryId, f.id) === token) return f;
  return null;
}

/** Expiry bucket for a URL issued now: the end of the next full bucket, so it lives 6 to 12 hours. */
export function expiryBucket(now = Date.now()): number {
  return Math.floor(now / BUCKET_MS) + 2;
}

export const isExpired = (bucket: number, now = Date.now()) => now >= bucket * BUCKET_MS;

const sign = (galleryId: string, token: string, size: MediaSize, bucket: number) =>
  mac("url", `${galleryId}\n${token}\n${size}\n${bucket}`, SIG_BYTES);

/** The URL the browser uses to load one photo of a protected gallery. */
export function signedMediaUrl(galleryId: string, fileId: string, size: MediaSize, now = Date.now()): string {
  const token = photoToken(galleryId, fileId);
  const e = expiryBucket(now);
  return `/api/g/${encodeURIComponent(galleryId)}/media/${token}?size=${size}&e=${e}&s=${sign(galleryId, token, size, e)}`;
}

/** Does the signature match (constant time)? Says nothing about expiry: use `isExpired` too. */
export function verifySignature(galleryId: string, token: string, size: MediaSize, bucket: number, signature: string): boolean {
  const expected = Buffer.from(sign(galleryId, token, size, bucket));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
