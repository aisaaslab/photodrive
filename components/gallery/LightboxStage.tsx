"use client";

import type { RefObject } from "react";
import type { DriveFile } from "@/lib/drive/types";
import { isProtectedPhoto, photoImageSrc } from "@/lib/drive/photo-src";
import { proxyUrl } from "@/lib/drive/proxy-url";
import { useLanguage } from "@/lib/i18n";
import type { Zoom } from "@/lib/gallery/lightbox-math";

interface Props {
  photo: DriveFile;
  galleryId: string;
  activeIndex: number;
  total: number;
  allowDownload: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  imgLoaded: boolean;
  onImgLoaded: () => void;
  zoom: Zoom;
  gesturing: boolean;
  areaRef: RefObject<HTMLDivElement | null>;
  imgRef: RefObject<HTMLImageElement | null>;
  suppressClick: { current: boolean };
  pointerHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
}

/** The main area: the previous / next arrows and the photo (zoomable) or video (a signed stream, or Drive's own player for public galleries). */
export function LightboxStage({
  photo, galleryId, activeIndex, total, allowDownload, onPrev, onNext, onClose, imgLoaded, onImgLoaded, zoom, gesturing, areaRef, imgRef, suppressClick, pointerHandlers,
}: Props) {
  const { t } = useLanguage();
  const g = t.gallery;
  const isVideoPhoto = photo.mimeType.startsWith("video/");
  return (
    <div
      ref={areaRef}
      className="flex-1 flex items-center justify-center relative px-2 sm:px-14 min-h-0 touch-none"
      onClick={() => { if (!suppressClick.current) onClose(); }}
      {...pointerHandlers}
    >
      {/* Prev */}
      {activeIndex > 0 && (
        <button
          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-surface-2 hover:bg-white/20 text-fg rounded-full transition-all z-10 hover:scale-110"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          aria-label={g.prevPhoto}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      )}

      {/* Image or Video */}
      <div onClick={(e) => e.stopPropagation()} className="max-w-5xl max-h-full w-full flex items-center justify-center relative">
        {isVideoPhoto ? (
          photo.urls ? (
            // Protected gallery: the signed same-site stream, so no Drive id or URL reaches the browser.
            <video
              key={photo.id}
              src={photo.urls.stream}
              controls
              playsInline
              controlsList={allowDownload ? undefined : "nodownload"}
              className="w-full max-w-4xl aspect-video max-h-[75vh] rounded-lg shadow-2xl animate-scale-in bg-black"
            />
          ) : (
            // Play the video straight from Google Drive's own player (no bytes
            // through our server). Keeps video off Vercel bandwidth.
            <iframe
              key={photo.id}
              src={`https://drive.google.com/file/d/${photo.id}/preview`}
              allow="autoplay; fullscreen"
              allowFullScreen
              className="w-full max-w-4xl aspect-video max-h-[75vh] rounded-lg shadow-2xl animate-scale-in border-0"
            />
          )
        ) : (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-8 h-8 border-2 border-fg-muted/30 border-t-white/80 rounded-full animate-spin" />
              </div>
            )}
            {/* The wrapper owns the entrance animation: an animation with
                fill-mode `both` would otherwise override the zoom transform. */}
            <div key={photo.id} className="max-w-full animate-scale-in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              draggable={false}
              src={photoImageSrc(photo, 2048)}
              alt={photo.name}
              fetchPriority="high"
              decoding="async"
              onLoad={() => onImgLoaded()}
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.dataset.fallback && !isProtectedPhoto(photo)) {
                  img.dataset.fallback = "1";
                  img.src = proxyUrl(galleryId, photo.id, "preview");
                } else {
                  onImgLoaded();
                }
              }}
              style={{
                transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`,
                transition: gesturing ? "none" : "transform 0.2s ease, opacity 0.3s",
                cursor: zoom.s > 1 ? (gesturing ? "grabbing" : "grab") : "zoom-in",
              }}
              className={`block max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl select-none ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            />
            </div>
          </>
        )}
      </div>

      {/* Next */}
      {activeIndex < total - 1 && (
        <button
          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-surface-2 hover:bg-white/20 text-fg rounded-full transition-all z-10 hover:scale-110"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          aria-label={g.nextPhoto}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      )}
    </div>
  );
}
