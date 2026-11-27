"use client";

import { Modal } from "@/components/ui/Modal";
import { useLanguage } from "@/lib/i18n";
import { GalleryDoc } from "@/lib/firestore/types";
import { COVER_RECOMMENDED } from "@/lib/gallery/cover-position";
import { CoverPhotoGrid } from "./cover/CoverPhotoGrid";
import { PositionAdjuster } from "./cover/PositionAdjuster";
import { useCoverPicker } from "./cover/useCoverPicker";
import type { CoverSaved } from "./cover/types";

export type { CoverSaved } from "./cover/types";

interface Props {
  gallery: GalleryDoc;
  onClose: () => void;
  onSaved: (cover: CoverSaved) => void;
}

/**
 * Modal that lets a photographer pick one of their gallery's photos as the cover/hero image. Shows a scrollable grid of thumbnails.
 * The user selects a photo (highlighted) then clicks Save to confirm — selecting does NOT save immediately, so they can browse and
 * change their mind before committing. The state and requests are in cover/useCoverPicker.ts (S5-10).
 *
 * Image loading: tries Google's CDN first (via driveImageUrl), then falls back to our /api/photos/proxy endpoint on error — same
 * strategy as PhotoTile, so broken thumbnails are self-healing.
 */
export function CoverPickerModal({ gallery, onClose, onSaved }: Props) {
  const { t } = useLanguage();
  const c = t.galleryCard;
  const picker = useCoverPicker(gallery, onSaved);
  const { photos, loading, error, selectedId, selectedPhoto, pos, setPos, saving, hasChanges, lowRes, portrait, selectPhoto, handleSave } = picker;

  return (
    <Modal
      onClose={onClose}
      ariaLabel={c.coverModalTitle}
      className="bg-surface border border-line rounded-card shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col"
    >
      <>
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-line shrink-0">
          <div>
            <h3 className="font-semibold text-fg">{c.coverModalTitle}</h3>
            <p className="text-xs text-fg-muted mt-0.5 truncate max-w-[24rem]">{gallery.name}</p>
          </div>
          <button onClick={onClose} aria-label={c.cancel} className="text-fg-muted hover:text-fg transition-colors shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body — scrollable grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-fg-muted/30 border-t-white rounded-full animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-fg-muted text-center py-16">{c.error}</p>
          ) : photos.length === 0 ? (
            <p className="text-sm text-fg-muted text-center py-16">{t.gallery.noPhotos}</p>
          ) : (
            <>
              {/* Size guidance — the banner is a wide, short strip, so photos
                  that suit it best are wide landscapes with the subject near
                  the middle. */}
              <div className="mb-4 flex gap-3 rounded-xl border border-accent/25 bg-accent/[0.07] p-3">
                <svg className="w-4 h-4 text-accent shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                </svg>
                <div className="text-xs leading-relaxed">
                  <p className="font-semibold text-fg">
                    {c.coverTipTitle}: {COVER_RECOMMENDED.width} × {COVER_RECOMMENDED.height} px
                  </p>
                  <p className="text-fg-muted mt-0.5">{c.coverTipBody}</p>
                </div>
              </div>

              {selectedPhoto && (
                <PositionAdjuster galleryId={gallery.id} selectedPhoto={selectedPhoto} pos={pos} onChange={setPos} lowRes={lowRes} portrait={portrait} />
              )}

              <CoverPhotoGrid galleryId={gallery.id} photos={photos} selectedId={selectedId} currentId={gallery.coverFileId} onSelect={selectPhoto} />
            </>
          )}
        </div>

        {/* Footer — Save / Cancel buttons */}
        <div className="p-4 border-t border-line flex items-center justify-between gap-3 shrink-0">
          {error ? (
            <p className="text-xs text-danger">{c.error}</p>
          ) : (
            <p className="text-xs text-fg-muted truncate flex-1">
              {selectedId === null
                ? c.coverRemove
                : selectedPhoto?.name ?? ""}
            </p>
          )}
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-fg-soft border border-line rounded-lg hover:bg-surface-2 transition-colors disabled:opacity-50"
            >
              {c.cancel}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="px-4 py-2 text-xs font-semibold bg-accent text-canvas rounded-pill hover:brightness-110 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? (
                <div className="w-3.5 h-3.5 border-2 border-canvas/30 border-t-canvas rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
              {c.save}
            </button>
          </div>
        </div>
      </>
    </Modal>
  );
}
