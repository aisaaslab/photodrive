"use client";

import { useLanguage } from "@/lib/i18n";
import type { DriveFile, DriveFolder } from "@/lib/drive/types";
import { countLabel, type GalleryFilter, type GallerySort } from "@/lib/gallery/view";
import { FilterTabs } from "./FilterTabs";
import { ExtraControls } from "./ExtraControls";

interface Props {
  displayed: DriveFile[];
  photoCount: number;
  videoCount: number;
  filter: GalleryFilter;
  onFilterChange: (f: GalleryFilter) => void;
  favoritesCount: number;
  subfolders: DriveFolder[];
  activeFolder: string | null;
  onFolderChange: (name: string | null) => void;
  showSearchSort: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  sort: GallerySort;
  onSortChange: (s: GallerySort) => void;
  allowDownload: boolean;
  selectionMode: boolean;
  allSelected: boolean;
  onDownloadAll: () => void;
  onSelectAll: () => void;
  onToggleSelectionMode: () => void;
}

/**
 * Filter + controls bar. Sticks under the gallery header while scrolling, so switching filter or selecting never needs a scroll back
 * up. On phones the sticky part is just the tabs + icon actions (one row); search / sort / folder sit in a normal row below.
 */
export function GalleryToolbar(p: Props) {
  const { t } = useLanguage();
  const g = t.gallery;
  const { displayed, selectionMode, allowDownload } = p;
  const extra = (
    <ExtraControls
      subfolders={p.subfolders}
      activeFolder={p.activeFolder}
      onFolderChange={p.onFolderChange}
      showSearchSort={p.showSearchSort}
      search={p.search}
      onSearchChange={p.onSearchChange}
      sort={p.sort}
      onSortChange={p.onSortChange}
    />
  );
  const hasExtraControls = p.subfolders.length > 0 || p.showSearchSort;

  return (
    <>
      <div className="sticky top-14 z-30 -mx-2 sm:-mx-6 px-3 sm:px-7 py-2 mb-3 sm:mb-5 bg-stone-50/90 backdrop-blur-md border-b border-stone-200/70">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FilterTabs
              filter={p.filter}
              setFilter={p.onFilterChange}
              photoCount={p.photoCount}
              videoCount={p.videoCount}
              favoritesCount={p.favoritesCount}
            />

            {/* Desktop: folder / search / sort share the row */}
            <div className="hidden sm:flex items-center gap-2">{extra}</div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <p className="hidden md:block text-xs text-stone-600">{countLabel(displayed, g)}</p>
            {!selectionMode && displayed.length > 0 && allowDownload && (
              <button
                onClick={p.onDownloadAll}
                aria-label={g.downloadAll}
                title={g.downloadAll}
                className="flex items-center gap-1.5 text-xs rounded-lg px-2.5 sm:px-3 py-1.5 font-medium transition-all border border-stone-300 text-stone-500 hover:text-stone-700 hover:border-stone-400"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                <span className="hidden sm:inline">{g.downloadAll}</span>
              </button>
            )}
            {selectionMode && (
              <button
                onClick={p.onSelectAll}
                className="flex items-center gap-1.5 text-xs rounded-lg px-2.5 sm:px-3 py-1.5 font-medium transition-all border border-stone-300 text-stone-600 hover:text-stone-900 hover:border-stone-400 bg-white whitespace-nowrap"
              >
                {p.allSelected ? g.deselectAll : g.selectAll}
              </button>
            )}
            {allowDownload && (
              <button
                onClick={p.onToggleSelectionMode}
                aria-pressed={selectionMode}
                aria-label={selectionMode ? g.cancel : g.select}
                title={selectionMode ? g.cancel : g.select}
                className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 sm:px-3 py-1.5 font-medium transition-all border ${
                  selectionMode
                    ? "bg-[#17509e] border-[#17509e] text-white"
                    : "border-stone-300 text-stone-500 hover:text-stone-700 hover:border-stone-400"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className={selectionMode ? "" : "hidden sm:inline"}>{selectionMode ? g.cancel : g.select}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Phones: folder / search / sort in their own (non-sticky) row */}
      {hasExtraControls && <div className="sm:hidden flex items-center flex-wrap gap-2 mb-4 px-1">{extra}</div>}
    </>
  );
}
