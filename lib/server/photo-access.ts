import "server-only";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { isAdmin } from "@/lib/firebase/admin-guard";
import { fetchDriveFolder } from "@/lib/drive/client";
import { verifyGalleryToken } from "@/lib/gallery/session";
import { isPrivate } from "@/lib/gallery/visibility";

/**
 * Per-visitor allowances shared by the photo proxy and the media route. Generous on purpose: when Google's CDN fails (proxy) or a
 * protected gallery is open (media), hundreds of thumbnails arrive at once. The limit is there to stop scripts, not visitors.
 */
export const VIEW_LIMIT = { limit: 900, windowSec: 60 };
/** Originals are big: a zip of a whole gallery is one request per photo. */
export const FULL_LIMIT = { limit: 1500, windowSec: 10 * 60 };

/** What the proxy needs to know about the gallery (or demo) a photo is requested for. */
export type ProxyGallery = {
  id: string;
  folderId: string;
  photographerId: string | null;
  allowDownload: boolean;
  private: boolean;
  pwChangedAt: number;
};

/** Looks the id up as a gallery, then as a live demo. Null when neither exists (or the demo has expired). */
export async function loadProxyGallery(id: string, now = Date.now()): Promise<ProxyGallery | null> {
  const db = getAdminDb();
  const gal = await db.collection("galleries").doc(id).get();
  if (gal.exists) {
    const g = gal.data()!;
    if (typeof g.folderId !== "string" || !g.folderId) return null;
    return {
      id,
      folderId: g.folderId,
      photographerId: typeof g.photographerId === "string" ? g.photographerId : null,
      allowDownload: g.allowDownload !== false,
      private: isPrivate(g),
      pwChangedAt: typeof g.pwChangedAt === "number" ? g.pwChangedAt : 0,
    };
  }
  const demo = await db.collection("demo_galleries").doc(id).get();
  if (!demo.exists) return null;
  const d = demo.data()!;
  if (typeof d.folderId !== "string" || !d.folderId) return null;
  if (typeof d.expiresAt === "number" && d.expiresAt < now) return null;
  return { id, folderId: d.folderId, photographerId: null, allowDownload: true, private: false, pwChangedAt: 0 };
}

/**
 * Is this file in the gallery's folder (or one of its subfolders)? Uses the same cached listing the gallery page uses
 * (refreshed every minute), so checking every thumbnail costs no extra Drive call. Throws if Drive cannot be read, which the
 * route turns into an error rather than serving an unchecked file.
 */
export async function fileInGallery(folderId: string, fileId: string): Promise<boolean> {
  const { files } = await fetchDriveFolder(folderId);
  return files.some((f) => f.id === fileId);
}

/** The signed-in photographer who owns the gallery, or an administrator. Needs an `Authorization: Bearer` header. */
export async function isOwnerOrAdmin(req: Request, gallery: ProxyGallery): Promise<boolean> {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return false;
  try {
    const { uid } = await getAdminAuth().verifyIdToken(token);
    return isAdmin(uid) || (gallery.photographerId !== null && uid === gallery.photographerId);
  } catch {
    return false;
  }
}

/** Has this visitor unlocked this private gallery (a valid, current access cookie)? */
export async function hasGalleryAccess(cookie: string | undefined, gallery: ProxyGallery): Promise<boolean> {
  if (!cookie) return false;
  const claims = await verifyGalleryToken(cookie);
  return !!claims && claims.galleryId === gallery.id && claims.v === gallery.pwChangedAt;
}

/** The protected delivery tier (D15/D18): private galleries and galleries with downloads turned off. */
export const isProtectedTier = (g: Pick<ProxyGallery, "private" | "allowDownload">) => g.private || !g.allowDownload;

/** The whole listing, for callers that must turn an opaque token back into a file. */
export async function galleryFiles(folderId: string) {
  return (await fetchDriveFolder(folderId)).files;
}
