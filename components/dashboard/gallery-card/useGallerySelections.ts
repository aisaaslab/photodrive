"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { GalleryDoc } from "@/lib/firestore/types";
import { proxyUrl } from "@/lib/drive/proxy-url";
import { zipToBlob, type ZipEntry } from "@/lib/shared/zip";
import { hasNewSelections, selectionSeenAt } from "@/lib/gallery/gallery-settings";

export type SelectionSubmission = { name: string; email: string | null; note: string | null; count: number; submittedAt: number };

/**
 * The client's favourites for a gallery, as the photographer sees them (S5-07): the list, the "Send selection" hand-off (name, e-mail,
 * note; owner-only), copying the list, and downloading the originals as a zip (authorised by sign-in, so it works even when downloads
 * are off for visitors). Also the "new" marker on the card: the browser remembers when the photographer last opened the panel.
 */
export function useGallerySelections(gallery: GalleryDoc) {
  const { user } = useAuth();
  const [showSelections, setShowSelections] = useState(false);
  const [selLoading, setSelLoading] = useState(false);
  const [selPhotos, setSelPhotos] = useState<{ id: string; name: string; count?: number }[]>([]);
  const [selError, setSelError] = useState(false);
  // The client's "Send selection" hand-off (name / email / note), owner-only.
  const [selSubmission, setSelSubmission] = useState<SelectionSubmission | null>(null);
  const [selCopied, setSelCopied] = useState(false);
  const [selZipping, setSelZipping] = useState(false);

  // "New favorites" marker: remember (per browser) when the photographer last
  // opened this gallery's selection, and badge the card if it changed since.
  const seenKey = `pd_sel_seen_${gallery.id}`;
  const [selSeenAt, setSelSeenAt] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try { return Number(localStorage.getItem(seenKey)) || 0; } catch { return 0; }
  });
  function markSelectionSeen() {
    const at = selectionSeenAt(gallery, Date.now());
    setSelSeenAt(at);
    try { localStorage.setItem(seenKey, String(at)); } catch { /* private mode */ }
  }

  async function openSelections() {
    setShowSelections(true);
    markSelectionSeen();
    setSelLoading(true);
    setSelError(false);
    try {
      // The token lets the server include the client's submission details,
      // which are never returned to the public.
      const token = await user?.getIdToken();
      const res = await fetch(`/api/galleries/${gallery.id}/selection`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelPhotos(data.photos ?? []);
      setSelSubmission(data.submission ?? null);
    } catch {
      setSelError(true);
    } finally {
      setSelLoading(false);
    }
  }

  function copySelectionList() {
    navigator.clipboard.writeText(selPhotos.map((p) => p.name).join("\n"));
    setSelCopied(true);
    setTimeout(() => setSelCopied(false), 2000);
  }

  async function downloadSelectionFiles() {
    if (selZipping || selPhotos.length === 0) return;
    setSelZipping(true);
    try {
      const entries: ZipEntry[] = [];
      // The owner's originals are authorised by sign-in (the gallery may have downloads turned off for visitors).
      const token = await user?.getIdToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      // Fetch in small batches; skip any file that fails instead of aborting.
      const CONCURRENCY = 4;
      for (let i = 0; i < selPhotos.length; i += CONCURRENCY) {
        const batch = selPhotos.slice(i, i + CONCURRENCY);
        await Promise.all(
          batch.map(async (p) => {
            try {
              const res = await fetch(proxyUrl(gallery.id, p.id, "full"), { headers });
              if (res.ok) entries.push({ name: p.name || `${p.id}.jpg`, blob: await res.blob() });
            } catch {
              // skip
            }
          })
        );
      }
      // STORE: no recompression (photos are already compressed).
      const content = await zipToBlob(entries);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = `${gallery.name || "selection"}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setSelZipping(false);
    }
  }

  return {
    showSelections, close: () => setShowSelections(false), selLoading, selPhotos, selError, selSubmission, selCopied, selZipping,
    hasNew: hasNewSelections(gallery, selSeenAt), openSelections, copySelectionList, downloadSelectionFiles,
  };
}
