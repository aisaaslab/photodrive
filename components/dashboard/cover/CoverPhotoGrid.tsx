"use client";

import { useLanguage } from "@/lib/i18n";
import { driveImageUrl } from "@/lib/drive/public-url";
import { proxyUrl } from "@/lib/drive/proxy-url";
import type { PickerPhoto } from "./types";

/** The "no cover (gradient)" option followed by the grid of the gallery's photos to pick from. */
export function CoverPhotoGrid({
  galleryId, photos, selectedId, currentId, onSelect,
}: {
  galleryId: string;
  photos: PickerPhoto[];
  selectedId: string | null;
  /** The cover that is saved right now. */
  currentId: string | null | undefined;
  onSelect: (id: string | null) => void;
}) {
  const { t } = useLanguage();
  const c = t.galleryCard;
  return (
    <>
  {/* "No cover" option — gradient fallback. Shown first, before the grid. */}
  <button
    onClick={() => onSelect(null)}
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
      const isCurrent = p.id === currentId;
      return (
        <div
          key={p.id}
          onClick={() => onSelect(p.id)}
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
                img.src = proxyUrl(galleryId, p.id, "thumb");
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
  );
}
