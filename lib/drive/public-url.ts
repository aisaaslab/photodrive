import { DriveFile } from "./types";

/**
 * Public image URL served straight from Google's own CDN, so the photo bytes
 * never pass through our server (no origin bandwidth cost). Works for files in
 * "anyone with the link" Drive folders, which is how galleries are set up.
 *
 * Prefers the file's `thumbnailLink` (an lh3.googleusercontent.com URL) — that
 * is Google's real global image CDN: fast and not rate-limited. We just swap
 * the size suffix (=s220 -> =s<size>). When no thumbnailLink is available we
 * fall back to Drive's slower thumbnail generator. On-screen, callers also fall
 * back to /api/photos/proxy via onError if a CDN URL ever fails.
 *
 * Used for viewing (thumbnails + full-screen preview). Original downloads still
 * go through /api/photos/proxy so the file is delivered as a real download.
 */
export function driveImageUrl(photo: Pick<DriveFile, "id" | "thumbnailLink">, size: number): string {
  const link = photo.thumbnailLink;
  if (link && /=s\d+(-[a-z]+)?$/i.test(link)) {
    return link.replace(/=s\d+(-[a-z]+)?$/i, `=s${size}`);
  }
  return `https://drive.google.com/thumbnail?id=${photo.id}&sz=w${size}`;
}

/**
 * Direct download URL served by Google (drive.usercontent), so a single-file
 * download streams from Google's servers, not through our function (no origin
 * bandwidth cost). Google sets the original filename via Content-Disposition.
 */
export function driveDownloadUrl(fileId: string): string {
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
}
