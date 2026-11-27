import { NextRequest, NextResponse } from "next/server";
import { route } from "@/lib/server/http";
import { clientIp, getRateLimiter, rateLimitHeaders } from "@/lib/server/rate-limit";
import { hasGalleryAccess, loadProxyGallery } from "@/lib/server/photo-access";
import { recordGalleryEvent } from "@/lib/server/repos/galleryStats";

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Counts one view of a gallery (S10-02). Called once by the gallery page when it opens. A visitor counts once per browser session:
 * the first call sets a session cookie (no expiry, so it ends with the browser session) and later calls, including page reloads, see
 * it and count nothing. The cookie holds no identifier, only "counted". A private gallery counts only for a visitor who unlocked it,
 * so nobody can inflate it by posting to a gallery they cannot open. Demo galleries are not counted.
 */
export const POST = route("galleries.view", async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!ID.test(id)) return NextResponse.json({ counted: false }, { status: 400 });

  const limit = await getRateLimiter().limit({ name: "gallery-view", id: `${clientIp(req)}|${id}`, limit: 60, windowSec: 10 * 60 });
  if (!limit.allowed) return NextResponse.json({ counted: false }, { status: 429, headers: rateLimitHeaders(limit) });

  const cookieName = `gv_${id}`;
  if (req.cookies.get(cookieName)) return NextResponse.json({ counted: false });

  const gallery = await loadProxyGallery(id);
  // `photographerId === null` is a demo gallery; a switched-off gallery shows nothing, so it has no views either.
  if (!gallery || gallery.photographerId === null || gallery.disabled || gallery.offline) return NextResponse.json({ counted: false });
  if (gallery.private && !(await hasGalleryAccess(req.cookies.get(`gallery_token_${id}`)?.value, gallery))) {
    return NextResponse.json({ counted: false });
  }

  await recordGalleryEvent(id, "view");
  const res = NextResponse.json({ counted: true });
  res.cookies.set(cookieName, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  return res;
});
