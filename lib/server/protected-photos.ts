import "server-only";
import type { DriveFile, DriveFolder } from "@/lib/drive/types";
import { photoToken, signedMediaUrl } from "@/lib/server/media-token";
import { isProtectedTier } from "@/lib/server/photo-access";

/**
 * The protected delivery tier (D15 option A, S3-03). Off unless `MEDIA_PROTECTED_TIER=1`, so shipping this code changes nothing for
 * any gallery until it is switched on (and, on a real deployment, tried on staging with real galleries first).
 */
export const protectedTierEnabled = () => process.env.MEDIA_PROTECTED_TIER === "1";

/** Does this gallery get opaque tokens and signed URLs instead of Drive ids and Google URLs? */
export const usesProtectedTier = (g: { private: boolean; allowDownload: boolean }) => protectedTierEnabled() && isProtectedTier(g);

const isVideo = (f: Pick<DriveFile, "mimeType">) => f.mimeType.startsWith("video/");

/**
 * What the browser receives for a protected gallery: the photo's Drive id becomes an opaque token, `thumbnailLink` (a Google URL
 * that identifies the file) is dropped, and signed same-site URLs are added. Names, types, sizes and subfolder names are kept.
 */
export function toProtectedPhotos(galleryId: string, files: DriveFile[], allowDownload: boolean, now = Date.now()): DriveFile[] {
  return files.map((f) => ({
    id: photoToken(galleryId, f.id),
    name: f.name,
    mimeType: f.mimeType,
    ...(f.width !== undefined ? { width: f.width } : {}),
    ...(f.height !== undefined ? { height: f.height } : {}),
    ...(f.folder !== undefined ? { folder: f.folder } : {}),
    urls: {
      thumb: signedMediaUrl(galleryId, f.id, "thumb", now),
      preview: signedMediaUrl(galleryId, f.id, "preview", now),
      ...(allowDownload ? { full: signedMediaUrl(galleryId, f.id, "full", now) } : {}),
      ...(isVideo(f) ? { stream: signedMediaUrl(galleryId, f.id, "stream", now) } : {}),
    },
  }));
}

/** Subfolders are shown by name, but their Drive folder ids are replaced by opaque ones too. */
export function toProtectedFolders(galleryId: string, folders: DriveFolder[]): DriveFolder[] {
  return folders.map((f) => ({ id: photoToken(galleryId, `folder:${f.id}`), name: f.name, path: f.path }));
}

/** The cover image of a protected gallery: a signed preview URL, or null when the cover photo is no longer in the folder. */
export function protectedCoverUrl(galleryId: string, coverFileId: string | undefined, files: DriveFile[], now = Date.now()): string | null {
  if (!coverFileId || !files.some((f) => f.id === coverFileId)) return null;
  return signedMediaUrl(galleryId, coverFileId, "preview", now);
}
