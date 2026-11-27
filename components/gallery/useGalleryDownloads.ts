"use client";

import { useState } from "react";
import type { DriveFile } from "@/lib/drive/types";
import { proxyUrl } from "@/lib/drive/proxy-url";
import { zipToBlob, type ZipEntry } from "@/lib/shared/zip";

// Must match PART_SIZE on the server route so the number of parts agrees.
const PART_SIZE = 300;

/** Zip downloads for a gallery (S5-08): selected files built in the browser, or the whole gallery streamed by the server. */
export function useGalleryDownloads(galleryId: string, photos: DriveFile[]) {
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  async function downloadFiles(ids: string[]) {
    if (zipping) return;
    setZipping(true);
    setZipProgress(0);
    try {
      const entries: ZipEntry[] = [];
      // Fetch in small batches instead of all at once: hundreds of parallel
      // full-size requests overwhelm the browser/connection and look "stuck".
      // A failed file is skipped rather than aborting the whole download.
      const CONCURRENCY = 4;
      let done = 0;
      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        const batch = ids.slice(i, i + CONCURRENCY);
        await Promise.all(
          batch.map(async (id) => {
            const photo = photos.find((p) => p.id === id);
            try {
              const res = await fetch(photo?.urls?.full ?? proxyUrl(galleryId, id, "full"));
              if (res.ok) entries.push({ name: photo?.name ?? `${id}.jpg`, blob: await res.blob() });
            } catch {
              // skip this file, keep the rest
            }
            setZipProgress(++done);
          })
        );
      }
      // Stored, not compressed: photos/videos are already compressed (see lib/shared/zip.ts).
      const content = await zipToBlob(entries);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = "photos.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setZipping(false);
    }
  }

  // "Download all" via the server (streams a zip, never leaves the site). Huge
  // galleries are split into parts. All parts are triggered inside the same
  // click so the browser shows ONE "allow multiple downloads" prompt and
  // downloads them together; staggering with timers gets the later parts
  // blocked because they fall outside the user gesture.
  function downloadAll() {
    const total = photos.length;
    const parts = Math.max(1, Math.ceil(total / PART_SIZE));
    for (let p = 1; p <= parts; p++) {
      const url =
        parts === 1
          ? `/api/galleries/${galleryId}/download-all`
          : `/api/galleries/${galleryId}/download-all?part=${p}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  return { zipping, zipProgress, downloadFiles, downloadAll };
}
