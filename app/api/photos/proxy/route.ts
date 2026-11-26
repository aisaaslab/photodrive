import { NextRequest, NextResponse } from "next/server";
import { clientIp, getRateLimiter, rateLimitHeaders } from "@/lib/server/rate-limit";
import { requestLogger } from "@/lib/server/log";
import { fileInGallery, hasGalleryAccess, isOwnerOrAdmin, loadProxyGallery } from "@/lib/server/photo-access";

const ID = /^[A-Za-z0-9_-]{1,200}$/;

// Generous on purpose: this route is the fallback when Google's CDN fails, and then a whole gallery (hundreds of thumbnails)
// can arrive at once. The limit is there to stop a script, not a visitor.
const THUMB_LIMIT = { limit: 900, windowSec: 60 };
// Originals are big: a zip of a whole gallery is one request per photo.
const FULL_LIMIT = { limit: 1500, windowSec: 10 * 60 };

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

  const rule = size === "full" ? FULL_LIMIT : THUMB_LIMIT;
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
    if (!gallery) return deny(404, "Not found");
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

  // full: original bytes (downloads). preview: compressed ~2048px for the
  // full-screen view. thumb: small ~800px grid thumbnail.
  let url: string;
  if (size === "full") {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
  } else if (size === "preview") {
    url = `https://drive.google.com/thumbnail?id=${fileId}&sz=w2048`;
  } else {
    url = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
  }

  try {
    // For originals (videos/downloads) forward the browser's Range header so
    // upstream can answer with a partial 206 — this is what lets the <video>
    // player seek/scrub instead of only playing from the start.
    const range = req.headers.get("range");
    const upstream = await fetch(url, range ? { headers: { Range: range } } : undefined);

    if (!upstream.ok) {
      return deny(502, "Could not fetch image");
    }

    if (size === "full") {
      // Stream the body (no full buffer in memory) and pass through the range
      // metadata so seeking works. Downloads send no Range → normal 200 stream.
      // Never cached by shared caches: whether it may be served depends on who asks and on the gallery's current settings.
      const headers = new Headers({ "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" });
      for (const h of ["content-type", "content-length", "content-range"] as const) {
        const v = upstream.headers.get(h);
        if (v) headers.set(h, v);
      }
      return new NextResponse(upstream.body, { status: upstream.status, headers });
    }

    // thumb / preview: small images — buffer + cache. Private galleries: browser cache only.
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": gallery.private ? "private, max-age=3600" : "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return deny(500, "Proxy error");
  }
}
