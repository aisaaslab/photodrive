"use client";

import { useLanguage } from "@/lib/i18n";
import type { GalleryFilter } from "@/lib/gallery/view";

/** The All / Photos / Videos / Favorites tabs. Favorites is rendered inline because it has an icon and a different count rule. */
export function FilterTabs({
  filter, setFilter, photoCount, videoCount, favoritesCount,
}: {
  filter: GalleryFilter;
  setFilter: (f: GalleryFilter) => void;
  photoCount: number;
  videoCount: number;
  favoritesCount: number;
}) {
  const { t } = useLanguage();
  const g = t.gallery;

  function tabBtn(value: GalleryFilter, label: string, count?: number) {
    const active = filter === value;
    return (
      <button
        onClick={() => setFilter(value)}
        aria-pressed={active}
        className={`flex items-center gap-1.5 px-2 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
          active ? "bg-accent-deep text-fg shadow-sm" : "text-fg-muted hover:text-fg-soft"
        }`}
      >
        {label}
        {count !== undefined && (
          <span className={`min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${active ? "bg-white/20 text-fg" : "bg-accent-deep text-fg"}`}>
            {count}
          </span>
        )}
      </button>
    );
  }

  return (
    <div data-ui="filter-tabs" className="flex items-center gap-1 bg-surface-2 rounded-xl p-1 overflow-x-auto shrink-0 max-w-full">
      {tabBtn("all", g.filterAll)}
      {tabBtn("photos", g.filterPhotos, photoCount)}
      {videoCount > 0 && tabBtn("videos", g.filterVideos, videoCount)}
      <button
        onClick={() => setFilter("favorites")}
        aria-pressed={filter === "favorites"}
        className={`flex items-center gap-1.5 px-2 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
          filter === "favorites" ? "bg-accent-deep text-fg shadow-sm" : "text-fg-muted hover:text-fg-soft"
        }`}
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={filter === "favorites" ? "white" : "none"} stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
        </svg>
        <span className="hidden min-[400px]:inline">{g.filterFavorites}</span>
        {favoritesCount > 0 && (
          <span className={`min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${filter === "favorites" ? "bg-white/20 text-fg" : "bg-accent-deep text-fg"}`}>
            {favoritesCount}
          </span>
        )}
      </button>
    </div>
  );
}
