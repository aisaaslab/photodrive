import type { DriveFile } from "./types";
import { driveDownloadUrl, driveImageUrl } from "./public-url";

/**
 * Where a gallery component gets a photo's bytes from. A photo of a protected gallery (S3-03) carries signed same-site `urls` and
 * has no Drive id, so those win; a photo of a public gallery is loaded from Google's CDN as before. Components never build a Drive
 * URL themselves, so a protected photo cannot leak one by accident.
 */
export const isProtectedPhoto = (p: Pick<DriveFile, "urls">) => !!p.urls;

/** Thumbnail or preview image. `size` is the pixel width wanted from Google's CDN (public tier); protected photos have two sizes. */
export function photoImageSrc(p: DriveFile, size: number): string {
  if (p.urls) return size > 1000 ? p.urls.preview : p.urls.thumb;
  return driveImageUrl(p, size);
}

/** Link for downloading the original, or null when the photo has none (a protected gallery with downloads off). */
export function photoDownloadHref(p: DriveFile): string | null {
  if (p.urls) return p.urls.full ?? null;
  return driveDownloadUrl(p.id);
}
