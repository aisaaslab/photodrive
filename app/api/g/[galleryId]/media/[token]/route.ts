import { NextRequest, NextResponse } from "next/server";
import { clientIp, getRateLimiter, rateLimitHeaders } from "@/lib/server/rate-limit";
import { requestLogger } from "@/lib/server/log";
import { streamFromDrive } from "@/lib/server/drive-stream";
import { MEDIA_SIZES, isExpired, resolvePhotoToken, verifySignature, type MediaSize } from "@/lib/server/media-token";
import {
  FULL_LIMIT, VIEW_LIMIT, galleryFiles, hasGalleryAccess, isOwnerOrAdmin, loadProxyGallery,
} from "@/lib/server/photo-access";

const ID = /^[A-Za-z0-9_-]{1,200}$/;
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
const deny = (status: number, error: string) => NextResponse.json({ error }, { status });

/**
 * Delivers one photo of a protected gallery (S3-02, decision D15). The page gives the browser signed URLs made of opaque photo
 * tokens (see `lib/server/media-token.ts`), so no Drive file id or Drive URL ever reaches it. Every request is checked:
 *
 *   signature and expiry  →  rate limit  →  the gallery exists (a demo too)  →  the token is one of the files in that gallery's
 *   own folder  →  private galleries need the visitor's unlock cookie  →  originals for download (`size=full`) need downloads
 *   turned on (`size=stream`, for playing a video in the page, does not).
 *
 * The photographer who owns the gallery and administrators (an `Authorization: Bearer` header) skip the cookie and download checks.
 * Range requests are forwarded so videos can seek. Responses for private galleries never sit in a shared cache.
 *
 * What this does not do: the Drive folder itself stays public (by design, D15), so this stops people getting photos by bypassing
 * the gallery, not by anyone who holds the folder link.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ galleryId: string; token: string }> }) {
  const log = requestLogger(req, "media");
  const { galleryId, token } = await params;
  const q = req.nextUrl.searchParams;
  const size = q.get("size") as MediaSize | null;
  const eRaw = q.get("e") ?? "";
  const e = Number(eRaw);
  const sig = q.get("s") ?? "";

  if (!ID.test(galleryId) || !TOKEN.test(token) || !size || !MEDIA_SIZES.includes(size) || !/^\d{1,10}$/.test(eRaw) || !sig || sig.length > 64) {
    return deny(400, "Invalid request");
  }
  if (!verifySignature(galleryId, token, size, e, sig)) return deny(403, "Forbidden");
  if (isExpired(e)) return deny(410, "This link has expired. Reload the gallery.");

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) return deny(500, "Server misconfigured");

  const heavy = size === "full" || size === "stream";
  const rule = heavy ? FULL_LIMIT : VIEW_LIMIT;
  const limit = await getRateLimiter().limit({ name: heavy ? "media-full" : "media-view", id: clientIp(req), ...rule });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(limit) });
  }

  let gallery;
  let file;
  try {
    gallery = await loadProxyGallery(galleryId);
    if (!gallery) return deny(404, "Not found");
    file = resolvePhotoToken(galleryId, token, await galleryFiles(gallery.folderId));
  } catch (err) {
    log.error("media access check failed", { galleryId, err: String(err) });
    return deny(502, "Could not check access");
  }
  if (!file) return deny(404, "Not found");

  const owner = gallery.private || size === "full" ? await isOwnerOrAdmin(req, gallery) : false;
  if (!owner) {
    if (gallery.private && !(await hasGalleryAccess(req.cookies.get(`gallery_token_${gallery.id}`)?.value, gallery))) {
      return deny(401, "Unauthorized");
    }
    if (size === "full" && !gallery.allowDownload) return deny(403, "Downloads are turned off for this gallery");
  }

  return streamFromDrive({ fileId: file.id, size, apiKey, range: req.headers.get("range"), sharedCache: !gallery.private, publicMaxAgeSec: 3600 });
}
