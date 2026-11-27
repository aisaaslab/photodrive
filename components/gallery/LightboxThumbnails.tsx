"use client";

import { useEffect, useRef } from "react";
import type { DriveFile } from "@/lib/drive/types";
import { isProtectedPhoto, photoImageSrc } from "@/lib/drive/photo-src";
import { proxyUrl } from "@/lib/drive/proxy-url";

/** The thumbnail strip along the bottom: jump to any photo; the open one is highlighted and kept in view. */
export function LightboxThumbnails({
  photos, activeIndex, favorites, galleryId, onGoTo,
}: {
  photos: DriveFile[];
  activeIndex: number;
  favorites: Set<string>;
  galleryId: string;
  onGoTo: (index: number) => void;
}) {
  const thumbsRef = useRef<HTMLDivElement>(null);

  // Scroll active thumbnail into view
  useEffect(() => {
    if (thumbsRef.current) {
      const active = thumbsRef.current.querySelector("[data-active='true']") as HTMLElement;
      active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeIndex]);

  return (
    <div className="shrink-0 pb-4 pt-3">
      <div
        ref={thumbsRef}
        className="flex gap-1.5 overflow-x-auto px-4 pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        {photos.map((p, i) => (
          <button
            key={p.id}
            data-active={i === activeIndex ? "true" : "false"}
            onClick={() => onGoTo(i)}
            aria-label={`${i + 1} / ${photos.length}`}
            aria-current={i === activeIndex ? "true" : undefined}
            className={`relative shrink-0 w-14 h-14 rounded-lg overflow-hidden transition-all ${
              i === activeIndex
                ? "ring-2 ring-canvas opacity-100 scale-105"
                : "opacity-40 hover:opacity-70"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoImageSrc(p, 150)}
              alt=""
              loading="lazy"
              onError={(e) => {
                // If Google's CDN throttles/fails, fall back to our proxy once.
                const img = e.currentTarget;
                if (!img.dataset.fallback && !isProtectedPhoto(p)) {
                  img.dataset.fallback = "1";
                  img.src = proxyUrl(galleryId, p.id, "thumb");
                }
              }}
              className="w-full h-full object-cover"
            />
            {favorites.has(p.id) && (
              <div className="absolute top-0.5 right-0.5 w-3 h-3 bg-accent-deep rounded-full" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
