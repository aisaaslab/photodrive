"use client";

import { useState, useRef, useEffect } from "react";
import { DriveFile } from "@/lib/drive/types";
import { FavoriteButton } from "./FavoriteButton";
import { driveImageUrl, driveDownloadUrl } from "@/lib/drive/public-url";
import { useLanguage } from "@/lib/i18n";

interface Props {
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

export function PhotoTile({
  photo, index, isFavorited, isSelected, selectionMode, allowDownload = true,
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
  // Reserve the exact tile height up-front from the known photo dimensions, so
  // the masonry layout never reflows/jumps (no flicker) as images lazy-load.
  const hasRatio = !isVideo && !!photo.width && !!photo.height;

  return (
    <div
      className={`masonry-item relative group cursor-pointer overflow-hidden rounded-xl bg-stone-200 transition-all ${
        isSelected ? "ring-2 ring-[#2D6A6A] ring-offset-2 ring-offset-stone-950" : ""
      } ${isVideo ? "aspect-video" : ""}`}
      style={hasRatio ? { aspectRatio: `${photo.width} / ${photo.height}` } : undefined}
      onClick={handleClick}
    >
      {/* Shimmer while loading */}
      {!loaded && (
        <div className={`${isVideo || hasRatio ? "absolute inset-0" : ""} photo-shimmer opacity-30`} style={!isVideo && !hasRatio ? { minHeight: "160px" } : undefined} />
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={isVideo && photo.thumbnailLink ? photo.thumbnailLink.replace(/=s\d+$/, "=s800") : driveImageUrl(photo, 800)}
        alt={photo.name}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={(e) => {
          // If Google's CDN throttles/fails, fall back to our proxy once.
          const img = e.currentTarget;
          if (!img.dataset.fallback && !isVideo) {
            img.dataset.fallback = "1";
            img.src = `/api/photos/proxy?fileId=${photo.id}&size=thumb`;
          } else {
            setLoaded(true);
          }
        }}
        className={`${isVideo || hasRatio ? "absolute inset-0 h-full" : ""} w-full object-cover transition-all duration-500 group-hover:scale-[1.03] ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Video play indicator */}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center ring-2 ring-white/20">
            <svg className="w-6 h-6 text-white translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5.14v14l11-7-11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />

      {/* Selection checkbox */}
      {selectionMode && (
        <div className={`absolute top-2.5 left-2.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
          isSelected
            ? "bg-[#2D6A6A] border-[#2D6A6A]"
            : "bg-black/40 border-white/60 backdrop-blur-sm"
        }`}>
          {isSelected && (
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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

      {/* Photo name (small pill, bottom-left) */}
      <div className="absolute bottom-2 left-2 max-w-[60%] pointer-events-none">
        <span className="block truncate bg-black/50 backdrop-blur-sm text-white/80 text-[11px] rounded-lg px-2 py-1">
          {photo.name}
        </span>
      </div>

      {/* Download button */}
      {!selectionMode && allowDownload && (
        <div className="absolute bottom-2 right-2">
          <a
            href={driveDownloadUrl(photo.id)}
            download={photo.name}
            onClick={(e) => e.stopPropagation()}
            className="bg-black/50 backdrop-blur-sm text-white/80 hover:text-white text-xs rounded-lg px-2 py-1 flex items-center gap-1 transition-colors"
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
