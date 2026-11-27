export type ProxySize = "thumb" | "preview" | "full";

/**
 * URL of the photo proxy for one file of one gallery (S3-04). The proxy only serves files that are in the gallery's own
 * folder, so the gallery id is required; `galleryId` is the id of a gallery or of a demo.
 */
export function proxyUrl(galleryId: string, fileId: string, size: ProxySize): string {
  return `/api/photos/proxy?g=${encodeURIComponent(galleryId)}&fileId=${encodeURIComponent(fileId)}&size=${size}`;
}
