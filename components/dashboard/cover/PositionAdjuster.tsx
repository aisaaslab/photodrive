"use client";

import { useLanguage } from "@/lib/i18n";
import { COVER_POS_DEFAULT, COVER_RECOMMENDED } from "@/lib/gallery/cover-position";
import { BannerPreview } from "./BannerPreview";
import type { PickerPhoto, Pos } from "./types";

/**
 * Position adjuster, shown only when a photo is selected. Drag either preview (or use the arrow keys) to choose what stays visible
 * in the banner; warns when the photo is low resolution or a portrait.
 */
export function PositionAdjuster({
  galleryId, selectedPhoto, pos, onChange, lowRes, portrait,
}: {
  galleryId: string;
  selectedPhoto: PickerPhoto;
  pos: Pos;
  onChange: (pos: Pos) => void;
  lowRes: boolean;
  portrait: boolean;
}) {
  const { t } = useLanguage();
  const c = t.galleryCard;
  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div>
          <p className="text-xs font-semibold text-white/90">{c.coverAdjustLabel}</p>
          <p className="text-[11px] text-white/50 mt-0.5">{c.coverDragHint}</p>
        </div>
        <button
          onClick={() => onChange({ x: COVER_POS_DEFAULT, y: COVER_POS_DEFAULT })}
          disabled={pos.x === COVER_POS_DEFAULT && pos.y === COVER_POS_DEFAULT}
          className="shrink-0 px-3 py-1.5 text-[11px] font-medium text-white/70 border border-white/10 rounded-lg hover:bg-white/[0.05] transition-colors disabled:opacity-40"
        >
          {c.coverReset}
        </button>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-start">
        <BannerPreview
          key={`d-${selectedPhoto.id}`}
          galleryId={galleryId}
          className="flex-1 min-w-0"
          photo={selectedPhoto}
          aspect={COVER_RECOMMENDED.desktopAspect}
          label={c.coverPreviewDesktop}
          pos={pos}
          onChange={onChange}
        />
        <BannerPreview
          key={`m-${selectedPhoto.id}`}
          galleryId={galleryId}
          className="w-full sm:w-44 shrink-0"
          photo={selectedPhoto}
          aspect={COVER_RECOMMENDED.mobileAspect}
          label={c.coverPreviewMobile}
          pos={pos}
          onChange={onChange}
        />
      </div>
      {(lowRes || portrait) && (
        <p className="mt-2.5 text-[11px] text-amber-300/90 flex items-start gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span>{portrait ? c.coverPortraitWarn : c.coverLowRes}</span>
        </p>
      )}
    </div>
  );
}
