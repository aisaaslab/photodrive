"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import { driveImageUrl } from "@/lib/drive/public-url";
import { GalleryDoc } from "@/lib/firestore/types";

interface PickerPhoto {
  id: string;
  name: string;
  thumbnailLink: string | null;
}

interface Props {
  gallery: GalleryDoc;
  onClose: () => void;
  onSaved: (coverFileId: string | null) => void;
}

/**
 * Modal that lets a photographer pick one of their gallery's photos as the
 * cover/hero image. Shows a scrollable grid of thumbnails. The user selects a
 * photo (highlighted) then clicks Save to confirm — selecting does NOT save
 * immediately, so they can browse and change their mind before committing.
 *
 * Image loading: tries Google's CDN first (via driveImageUrl), then falls back
 * to our /api/photos/proxy endpoint on error — same strategy as PhotoTile, so
 * broken thumbnails are self-healing.
 */
export function CoverPickerModal({ gallery, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const c = t.galleryCard;
  const [photos, setPhotos] = useState<PickerPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Local selection — NOT saved yet. null = "no cover" (gradient fallback).
  // Initialized to the gallery's current cover so the user sees what's set.
  const [selectedId, setSelectedId] = useState<string | null>(gallery.coverFileId ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError(false);
    user
      .getIdToken()
      .then((token) =>
        fetch(`/api/galleries/${gallery.id}/photos`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      )
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data: { photos: PickerPhoto[] }) => setPhotos(data.photos ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [user, gallery.id]);

  // Whether the selection differs from what's already saved. If it's the same,
  // the Save button is disabled — no point saving an identical value.
  const hasChanges = selectedId !== (gallery.coverFileId ?? null);

  async function handleSave() {
    if (!user || !hasChanges) return;
    setSaving(true);
    setError(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/galleries/${gallery.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ coverFileId: selectedId }),
      });
      if (!res.ok) throw new Error();
      onSaved(selectedId);
    } catch {
      setError(true);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-[#111111] border border-white/10 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-white/[0.08] shrink-0">
          <div>
            <h3 className="font-semibold text-white">{c.coverModalTitle}</h3>
            <p className="text-xs text-white/50 mt-0.5 truncate max-w-[24rem]">{gallery.name}</p>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body — scrollable grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-white/50 text-center py-16">{c.error}</p>
          ) : photos.length === 0 ? (
            <p className="text-sm text-white/50 text-center py-16">{t.gallery.noPhotos}</p>
          ) : (
            <>
              {/* "No cover" option — gradient fallback. Shown first, before the grid. */}
              <button
                onClick={() => setSelectedId(null)}
                className={`w-full mb-4 h-16 rounded-xl border-2 transition-all flex items-center justify-center gap-2 text-sm ${
                  selectedId === null
                    ? "border-[#2dabe0] ring-2 ring-[#2dabe0]/30 bg-[#2dabe0]/10 text-white"
                    : "border-white/10 hover:border-white/20 text-white/50 hover:text-white/70"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
                {c.coverRemove} (gradient)
              </button>

              {/* Thumbnail grid — 3 columns on mobile, 5 on tablet, 6 on desktop.
                  Each tile has a fixed aspect-square so the grid holds its shape
                  even while images are loading or broken. */}
              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
                {photos.map((p) => {
                  const isSelected = p.id === selectedId;
                  const isCurrent = p.id === gallery.coverFileId;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      title={p.name}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all bg-white/[0.03] ${
                        isSelected
                          ? "border-[#2dabe0] ring-2 ring-[#2dabe0]/30"
                          : "border-transparent hover:border-white/20"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={driveImageUrl({ id: p.id, thumbnailLink: p.thumbnailLink ?? undefined }, 200)}
                        alt={p.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Same self-healing fallback as PhotoTile: if Google's
                          // CDN fails/throttles, retry once via our proxy.
                          const img = e.currentTarget;
                          if (!img.dataset.fallback) {
                            img.dataset.fallback = "1";
                            img.src = `/api/photos/proxy?fileId=${p.id}&size=thumb`;
                          }
                        }}
                      />
                      {/* "Current" badge — what's saved right now */}
                      {isCurrent && (
                        <div className="absolute top-1 left-1 bg-white/80 text-stone-900 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          {c.coverCurrent}
                        </div>
                      )}
                      {/* Selected checkmark overlay */}
                      {isSelected && (
                        <div className="absolute inset-0 bg-[#2dabe0]/20 flex items-center justify-center">
                          <div className="w-6 h-6 bg-[#2dabe0] rounded-full flex items-center justify-center">
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer — Save / Cancel buttons */}
        <div className="p-4 border-t border-white/[0.08] flex items-center justify-between gap-3 shrink-0">
          {error ? (
            <p className="text-xs text-red-400">{c.error}</p>
          ) : (
            <p className="text-xs text-white/40 truncate flex-1">
              {selectedId === null
                ? c.coverRemove
                : photos.find((p) => p.id === selectedId)?.name ?? ""}
            </p>
          )}
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-white/70 border border-white/10 rounded-lg hover:bg-white/[0.05] transition-colors disabled:opacity-50"
            >
              {c.cancel}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="px-4 py-2 text-xs font-semibold bg-white text-stone-900 rounded-lg hover:bg-stone-100 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? (
                <div className="w-3.5 h-3.5 border-2 border-stone-400 border-t-stone-900 rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
              {c.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
