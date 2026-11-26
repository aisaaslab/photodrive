"use client";

import { useRef, useState } from "react";
import { driveImageUrl } from "@/lib/drive/public-url";
import { coverObjectPosition } from "@/lib/gallery/cover-position";
import { proxyUrl } from "@/lib/drive/proxy-url";
import type { PickerPhoto, Pos } from "./types";

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
export function BannerPreview({
  galleryId,
  photo,
  aspect,
  label,
  pos,
  onChange,
  className = "",
}: {
  galleryId: string;
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
              img.src = proxyUrl(galleryId, photo.id, "preview");
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
