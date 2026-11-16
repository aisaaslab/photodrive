"use client";

import { useState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import { driveImageUrl } from "@/lib/drive/public-url";
import { GalleryDoc } from "@/lib/firestore/types";
import {
  COVER_POS_DEFAULT,
  COVER_RECOMMENDED,
  coverObjectPosition,
  validCoverPos,
} from "@/lib/gallery/cover-position";

interface PickerPhoto {
  id: string;
  name: string;
  thumbnailLink: string | null;
  width?: number | null;
  height?: number | null;
}

/** What the picker saved — merged into the gallery by the parent. */
export interface CoverSaved {
  coverFileId: string | null;
  coverPosX: number | null;
  coverPosY: number | null;
}

interface Props {
  gallery: GalleryDoc;
  onClose: () => void;
  onSaved: (cover: CoverSaved) => void;
}

interface Pos {
  x: number;
  y: number;
}

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

/**
 * A banner-shaped crop of the chosen photo that the photographer can drag
 * (mouse, touch, or arrow keys) to choose which part stays visible. It renders
 * the photo with object-fit: cover — exactly how the public banner does — so
 * what they see here is what clients get at that aspect ratio.
 *
 * Dragging math: with object-fit: cover the photo overflows the box on one
 * axis only. object-position p% shifts the photo by -overflow * p/100, so
 * dragging the photo by dx px changes p by -dx / overflow * 100.
 */
function BannerPreview({
  photo,
  aspect,
  label,
  pos,
  onChange,
  className = "",
}: {
  photo: PickerPhoto;
  aspect: number;
  label: string;
  pos: Pos;
  onChange: (pos: Pos) => void;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const natural = useRef<{ w: number; h: number } | null>(null);
  const drag = useRef<{ x: number; y: number; start: Pos } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Overflow (px) of the covered photo beyond the box, per axis.
  function overflow() {
    const box = boxRef.current;
    const nat = natural.current;
    if (!box || !nat) return { x: 0, y: 0 };
    const scale = Math.max(box.clientWidth / nat.w, box.clientHeight / nat.h);
    return {
      x: Math.max(0, nat.w * scale - box.clientWidth),
      y: Math.max(0, nat.h * scale - box.clientHeight),
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: pos };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const o = overflow();
    onChange({
      x: o.x > 1 ? clampPct(d.start.x - ((e.clientX - d.x) / o.x) * 100) : d.start.x,
      y: o.y > 1 ? clampPct(d.start.y - ((e.clientY - d.y) / o.y) * 100) : d.start.y,
    });
  }

  function endDrag() {
    drag.current = null;
    setDragging(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 10 : 2;
    const o = overflow();
    // Arrow = move the *view* in that direction (same as dragging the photo
    // the opposite way).
    const dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
    const dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    onChange({
      x: o.x > 1 ? clampPct(pos.x + dx) : pos.x,
      y: o.y > 1 ? clampPct(pos.y + dy) : pos.y,
    });
  }

  return (
    <div className={className}>
      <p className="text-[11px] font-medium text-white/50 mb-1.5">{label}</p>
      <div
        ref={boxRef}
        role="group"
        aria-label={label}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        style={{ aspectRatio: String(aspect) }}
        className={`relative w-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] select-none touch-none outline-none focus-visible:ring-2 focus-visible:ring-[#2dabe0]/60 ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={driveImageUrl({ id: photo.id, thumbnailLink: photo.thumbnailLink ?? undefined }, 1200)}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ objectPosition: coverObjectPosition(pos.x, pos.y) }}
          onLoad={(e) => {
            natural.current = {
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            };
          }}
          onError={(e) => {
            const img = e.currentTarget;
            if (!img.dataset.fallback) {
              img.dataset.fallback = "1";
              img.src = `/api/photos/proxy?fileId=${photo.id}&size=preview`;
            }
          }}
        />
        {/* Same readability gradient as the public banner */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        {!dragging && (
          <div className="absolute top-1.5 right-1.5 pointer-events-none bg-black/50 text-white/90 rounded-full p-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5L12 3l4.5 4.5M7.5 16.5L12 21l4.5-4.5M3 12h18" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
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
  // Focal point of the cover (percent). Starts at what's saved (centered when
  // never adjusted) and resets to centered when a different photo is chosen.
  const savedPos: Pos = {
    x: validCoverPos(gallery.coverPosX) ?? COVER_POS_DEFAULT,
    y: validCoverPos(gallery.coverPosY) ?? COVER_POS_DEFAULT,
  };
  const [pos, setPos] = useState<Pos>(savedPos);

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
  const posChanged = pos.x !== savedPos.x || pos.y !== savedPos.y;
  const hasChanges = selectedId !== (gallery.coverFileId ?? null) || (selectedId !== null && posChanged);

  function selectPhoto(id: string | null) {
    setSelectedId(id);
    // Back on the saved cover → restore its saved position; any other photo
    // starts centered.
    setPos(id !== null && id === gallery.coverFileId ? savedPos : { x: COVER_POS_DEFAULT, y: COVER_POS_DEFAULT });
  }

  const selectedPhoto = photos.find((p) => p.id === selectedId) ?? null;
  const lowRes =
    !!selectedPhoto?.width && selectedPhoto.width < COVER_RECOMMENDED.minWidth;
  const portrait =
    !!selectedPhoto?.width && !!selectedPhoto?.height && selectedPhoto.height > selectedPhoto.width;

  async function handleSave() {
    if (!user || !hasChanges) return;
    setSaving(true);
    setError(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/galleries/${gallery.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          coverFileId: selectedId,
          // No cover => no focal point to remember.
          coverPosX: selectedId === null ? null : pos.x,
          coverPosY: selectedId === null ? null : pos.y,
        }),
      });
      if (!res.ok) throw new Error();
      onSaved({
        coverFileId: selectedId,
        coverPosX: selectedId === null ? null : pos.x,
        coverPosY: selectedId === null ? null : pos.y,
      });
    } catch {
      setError(true);
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      ariaLabel={c.coverModalTitle}
      className="bg-[#111111] border border-white/10 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col"
    >
      <>
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-white/[0.08] shrink-0">
          <div>
            <h3 className="font-semibold text-white">{c.coverModalTitle}</h3>
            <p className="text-xs text-white/50 mt-0.5 truncate max-w-[24rem]">{gallery.name}</p>
          </div>
          <button onClick={onClose} aria-label={c.cancel} className="text-white/50 hover:text-white transition-colors shrink-0">
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
              {/* Size guidance — the banner is a wide, short strip, so photos
                  that suit it best are wide landscapes with the subject near
                  the middle. */}
              <div className="mb-4 flex gap-3 rounded-xl border border-[#2dabe0]/25 bg-[#2dabe0]/[0.07] p-3">
                <svg className="w-4 h-4 text-[#2dabe0] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                </svg>
                <div className="text-xs leading-relaxed">
                  <p className="font-semibold text-white/90">
                    {c.coverTipTitle}: {COVER_RECOMMENDED.width} × {COVER_RECOMMENDED.height} px
                  </p>
                  <p className="text-white/60 mt-0.5">{c.coverTipBody}</p>
                </div>
              </div>

              {/* Position adjuster — only when a photo is selected. Drag either
                  preview (or use arrow keys) to choose what stays visible. */}
              {selectedPhoto && (
                <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-3 mb-2.5">
                    <div>
                      <p className="text-xs font-semibold text-white/90">{c.coverAdjustLabel}</p>
                      <p className="text-[11px] text-white/50 mt-0.5">{c.coverDragHint}</p>
                    </div>
                    <button
                      onClick={() => setPos({ x: COVER_POS_DEFAULT, y: COVER_POS_DEFAULT })}
                      disabled={pos.x === COVER_POS_DEFAULT && pos.y === COVER_POS_DEFAULT}
                      className="shrink-0 px-3 py-1.5 text-[11px] font-medium text-white/70 border border-white/10 rounded-lg hover:bg-white/[0.05] transition-colors disabled:opacity-40"
                    >
                      {c.coverReset}
                    </button>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-start">
                    <BannerPreview
                      key={`d-${selectedPhoto.id}`}
                      className="flex-1 min-w-0"
                      photo={selectedPhoto}
                      aspect={COVER_RECOMMENDED.desktopAspect}
                      label={c.coverPreviewDesktop}
                      pos={pos}
                      onChange={setPos}
                    />
                    <BannerPreview
                      key={`m-${selectedPhoto.id}`}
                      className="w-full sm:w-44 shrink-0"
                      photo={selectedPhoto}
                      aspect={COVER_RECOMMENDED.mobileAspect}
                      label={c.coverPreviewMobile}
                      pos={pos}
                      onChange={setPos}
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
              )}

              {/* "No cover" option — gradient fallback. Shown first, before the grid. */}
              <button
                onClick={() => selectPhoto(null)}
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
                      onClick={() => selectPhoto(p.id)}
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
      </>
    </Modal>
  );
}
