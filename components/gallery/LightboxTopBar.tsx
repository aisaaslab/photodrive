"use client";

import { useLanguage } from "@/lib/i18n";

interface Props {
  /** Zero-based position of the open photo, and how many there are. */
  index: number;
  total: number;
  playing: boolean;
  onToggleSlideshow: () => void;
  isFavorited: boolean;
  onToggleFavorite: () => void;
  /** The link for downloading the original, or null when there is none (downloads off, or a protected gallery that does not allow it). */
  download: { href: string; name: string } | null;
  /** Zoom is for photos only. */
  showZoom: boolean;
  zoomed: boolean;
  onToggleZoom: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

/** The lightbox's top bar: counter, slideshow, favourite, download, zoom, fullscreen and close. */
export function LightboxTopBar({
  index, total, playing, onToggleSlideshow, isFavorited, onToggleFavorite, download, showZoom, zoomed, onToggleZoom, isFullscreen, onToggleFullscreen, onClose,
}: Props) {
  const { t } = useLanguage();
  const g = t.gallery;
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-3 sm:px-5 sm:py-4 shrink-0">
      {/* Counter */}
      <span data-ui="lightbox-counter" className="text-fg-muted text-sm whitespace-nowrap">
        {index + 1} <span className="text-fg-muted/50">/</span> {total}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Slideshow play/pause */}
        <button
          onClick={onToggleSlideshow}
          title={g.slideshow}
          aria-label={g.slideshow}
          aria-pressed={playing}
          className={`flex size-10 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-all sm:size-auto sm:px-3 sm:py-1.5 ${
            playing
              ? "bg-accent-deep text-fg"
              : "bg-surface-2 text-fg-soft hover:bg-white/20"
          }`}
        >
          {playing ? (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5.14v14l11-7-11-7z" />
            </svg>
          )}
          <span className="hidden sm:inline">{g.slideshow}</span>
        </button>

        {/* Favorite */}
        <button
          onClick={onToggleFavorite}
          aria-label={g.favorite}
          aria-pressed={isFavorited}
          className={`flex size-10 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-all sm:size-auto sm:px-3 sm:py-1.5 ${
            isFavorited
              ? "bg-accent-deep text-fg"
              : "bg-surface-2 text-fg-soft hover:bg-white/20"
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={isFavorited ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
          <span className="hidden sm:inline">{g.favorite}</span>
        </button>

        {/* Download */}
        {download && (
          <a
            href={download.href}
            download={download.name}
            aria-label={g.download}
            onClick={(e) => e.stopPropagation()}
            className="flex size-10 items-center justify-center gap-1.5 bg-surface-2 hover:bg-white/20 text-fg-soft hover:text-fg rounded-full text-xs font-medium transition-all sm:size-auto sm:px-3 sm:py-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <span className="hidden sm:inline">{g.download}</span>
          </a>
        )}

        {/* Zoom (photos only): toggles 1× ↔ 2.5×. Pinch, double-tap and
            + / − / 0 work too. */}
        {showZoom && (
          <button
            onClick={onToggleZoom}
            title={`${g.zoom} (+ / − / 0)`}
            aria-label={g.zoom}
            aria-pressed={zoomed}
            className={`size-10 sm:size-8 flex items-center justify-center rounded-full transition-all ${
              zoomed ? "bg-accent-deep text-fg" : "bg-surface-2 hover:bg-white/20 text-fg-soft hover:text-fg"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
            </svg>
          </button>
        )}

        {/* Fullscreen */}
        <button
          onClick={onToggleFullscreen}
          title={g.fullscreen}
          aria-label={g.fullscreen}
          className="hidden sm:flex size-10 sm:size-8 items-center justify-center bg-surface-2 hover:bg-white/20 text-fg-soft hover:text-fg rounded-full transition-all"
        >
          {isFullscreen ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          )}
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          aria-label={g.closeViewer}
          title={g.closeViewer}
          className="size-10 sm:size-8 flex items-center justify-center bg-surface-2 hover:bg-white/20 text-fg-soft hover:text-fg rounded-full transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
