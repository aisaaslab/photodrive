import { NextRequest, NextResponse } from "next/server";
import { clientIp, getRateLimiter, rateLimitHeaders } from "@/lib/server/rate-limit";
import { requestLogger } from "@/lib/server/log";
import { streamFromDrive } from "@/lib/server/drive-stream";
import { FULL_LIMIT, VIEW_LIMIT, fileInGallery, hasGalleryAccess, isOwnerOrAdmin, loadProxyGallery } from "@/lib/server/photo-access";

const ID = /^[A-Za-z0-9_-]{1,200}$/;

const deny = (status: number, error: string) => NextResponse.json({ error }, { status });

/**
 * Proxies Drive image bytes so the client never sees Google Drive URLs.
 * ?g=<gallery or demo id>&fileId=xxx&size=thumb|preview|full
 *   thumb   — small grid thumbnail (~800px)
 *   preview — compressed full-screen view (~2048px)
 *   full    — original, uncompressed file (downloads only)
 *
 * Hardened (S3-04, SEC-1). Before, any caller could fetch any Drive file the server's API key could read. Now:
 * - `g` is required and the file must be in that gallery's folder (or a subfolder), so a foreign file id is refused (403);
 * - requests are rate limited per visitor;
 * - `full` needs the gallery to allow downloads, and, for a private gallery, the visitor's unlock cookie. The photographer who
 *   owns the gallery and administrators (sent as `Authorization: Bearer`) can always fetch originals;
 * - responses for private galleries, and all originals, are `private` for caches.
 */
export async function GET(req: NextRequest) {
  const log = requestLogger(req, "photos.proxy");
  const { searchParams } = req.nextUrl;
  const galleryId = searchParams.get("g");
  const fileId = searchParams.get("fileId");
  const size = searchParams.get("size") ?? "thumb";

  if (!galleryId || !ID.test(galleryId) || !fileId || !ID.test(fileId) || !["thumb", "preview", "full"].includes(size)) {
    return deny(400, "Missing or invalid parameters");
  }

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) return deny(500, "Server misconfigured");

  const rule = size === "full" ? FULL_LIMIT : VIEW_LIMIT;
  const limit = await getRateLimiter().limit({
    name: size === "full" ? "photo-full" : "photo-view",
    id: clientIp(req),
    ...rule,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(limit) });
  }

  let gallery;
  try {
    gallery = await loadProxyGallery(galleryId);
    if (!gallery || gallery.disabled) return deny(404, "Not found");
    if (!(await fileInGallery(gallery.folderId, fileId))) {
      log.warn("photo outside gallery refused", { galleryId, size });
      return deny(403, "Forbidden");
    }
  } catch (err) {
    log.error("photo access check failed", { galleryId, err: String(err) });
    return deny(502, "Could not check access");
  }

  if (size === "full") {
    const owner = await isOwnerOrAdmin(req, gallery);
    if (!owner) {
      if (!gallery.allowDownload) return deny(403, "Downloads are turned off for this gallery");
      if (gallery.private && !(await hasGalleryAccess(req.cookies.get(`gallery_token_${gallery.id}`)?.value, gallery))) {
        return deny(401, "Unauthorized");
      }
    }
  }

  return streamFromDrive({
    fileId,
    size: size as "thumb" | "preview" | "full",
    apiKey,
    range: req.headers.get("range"),
    sharedCache: !gallery.private,
  });
}
