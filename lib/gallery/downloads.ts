/**
 * Whether visitors may download original photos from a gallery (S9-06). One rule for every place that enforces it (photo proxy, media
 * route, download-all, the gallery page), so they cannot disagree. Downloads are off when the owner switched them off, or when the owner
 * chose "switch off downloads once a selection is sent" and a selection has been sent since (the submit route stamps
 * `downloadsLockedAt`). The owner and administrators are never affected: their own routes do not ask this.
 */
export type DownloadFields = {
  allowDownload?: boolean;
  disableDownloadAfterSubmit?: boolean;
  /** When a selection was sent while "switch off downloads after sending" was on. */
  downloadsLockedAt?: number | null;
};

export const downloadsLocked = (g: DownloadFields): boolean => g.disableDownloadAfterSubmit === true && typeof g.downloadsLockedAt === "number";

export const downloadsAllowed = (g: DownloadFields): boolean => g.allowDownload !== false && !downloadsLocked(g);
