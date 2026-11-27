"use client";

import { useState, useRef, useEffect } from "react";
import { DriveFile } from "@/lib/drive/types";
import { FavoriteButton } from "./FavoriteButton";
import { photoDownloadHref, photoImageSrc, isProtectedPhoto } from "@/lib/drive/photo-src";
import { useLanguage } from "@/lib/i18n";
import { proxyUrl } from "@/lib/drive/proxy-url";

interface Props {
  galleryId: string;
  photo: DriveFile;
  index: number;
  isFavorited: boolean;
  isSelected?: boolean;
  selectionMode?: boolean;
  allowDownload?: boolean;
  onOpen: (index: number) => void;
  onToggleFavorite: (photoId: string) => void;
  onToggleSelect?: (photoId: string) => void;
}

// Used when Drive doesn't report a photo's pixel size (rare): a typical 3:2.
const FALLBACK_RATIO = 1.5;

export function PhotoTile({
  galleryId, photo, index, isFavorited, isSelected, selectionMode, allowDownload = true,
  onOpen, onToggleFavorite, onToggleSelect,
}: Props) {
  const { t } = useLanguage();
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // If the image already finished loading before React attached onLoad (e.g. it
  // was cached / completed during hydration), reveal it anyway so it isn't stuck
  // invisible until a refresh.
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

  function handleClick() {
    if (selectionMode) {
      onToggleSelect?.(photo.id);
    } else {
      onOpen(index);
    }
  }

  const isVideo = photo.mimeType.startsWith("video/");
  // Every tile reserves its exact shape up-front from the known dimensions, so
  // the grid never reflows as images lazy-load. `--r` feeds the justified-rows
  // layout in globals.css (.photo-item).
  const ratio =
    photo.width && photo.height ? Math.min(4, Math.max(0.4, photo.width / photo.height)) : FALLBACK_RATIO;

  return (
    <div
      className={`relative group overflow-hidden rounded-xl bg-surface-2 transition-all ${
        isSelected ? "ring-2 ring-accent-deep ring-offset-2 ring-offset-canvas" : ""
      } ${isVideo ? "aspect-video" : "photo-item"}`}
      style={
        isVideo
          ? undefined
          : ({ "--r": ratio, aspectRatio: String(ratio) } as React.CSSProperties)
      }
    >
      {/* Shimmer while loading */}
      {!loaded && <div className="absolute inset-0 photo-shimmer opacity-30" />}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={isVideo && photo.thumbnailLink ? photo.thumbnailLink.replace(/=s\d+$/, "=s800") : photoImageSrc(photo, 800)}
        alt=""
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={(e) => {
          // If Google's CDN throttles/fails, fall back to our proxy once.
          const img = e.currentTarget;
          if (!img.dataset.fallback && !isVideo && !isProtectedPhoto(photo)) {
            img.dataset.fallback = "1";
            img.src = proxyUrl(galleryId, photo.id, "thumb");
          } else {
            setLoaded(true);
          }
        }}
        className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover:scale-[1.03] ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Video play indicator */}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center ring-2 ring-line">
            <svg className="w-6 h-6 text-fg translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5.14v14l11-7-11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300 rounded-xl pointer-events-none" />

      {/* The tile's main control: a real button covering the whole tile, so it
          is keyboard-focusable and announced properly. The favorite and
          download controls below sit above it (later in DOM order). */}
      <button
        type="button"
        onClick={handleClick}
        aria-label={`${photo.name}`}
        aria-pressed={selectionMode ? !!isSelected : undefined}
        className="absolute inset-0 rounded-xl cursor-pointer focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-accent"
      />

      {/* Selection checkbox */}
      {selectionMode && (
        <div className={`absolute top-2.5 left-2.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all pointer-events-none ${
          isSelected
            ? "bg-accent-deep border-accent-deep"
            : "bg-black/40 border-white/60 backdrop-blur-sm"
        }`}>
          {isSelected && (
            <svg className="w-3.5 h-3.5 text-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
        </div>
      )}

      {/* Favorite button (hidden in selection mode) */}
      {!selectionMode && (
        <FavoriteButton
          photoId={photo.id}
          isFavorited={isFavorited}
          onToggle={onToggleFavorite}
        />
      )}

      {/* Photo name — only on hover/focus. Filenames like IMG_4821.jpg are
          noise for clients, so they aren't shown permanently (and never on
          touch screens, which have no hover). */}
      <div className="absolute bottom-2 left-2 max-w-[60%] pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200">
        <span className="block truncate bg-black/50 backdrop-blur-sm text-fg text-xs rounded-lg px-2 py-1">
          {photo.name}
        </span>
      </div>

      {/* Download button */}
      {!selectionMode && allowDownload && photoDownloadHref(photo) && (
        <div className="absolute bottom-2 right-2">
          <a
            href={photoDownloadHref(photo)!}
            download={photo.name}
            onClick={(e) => e.stopPropagation()}
            aria-label={`${t.gallery.download} ${photo.name}`}
            className="bg-black/50 backdrop-blur-sm text-fg hover:text-fg text-xs rounded-lg px-2 py-1 flex items-center gap-1 transition-colors focus-visible:outline-2 focus-visible:outline-fg"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {t.gallery.download}
          </a>
        </div>
      )}
    </div>
  );
}
