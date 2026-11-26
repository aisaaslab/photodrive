"use client";

import { useLanguage } from "@/lib/i18n";
import type { DriveFolder } from "@/lib/drive/types";
import type { GallerySort } from "@/lib/gallery/view";
import { FolderDropdown } from "./FolderDropdown";

/**
 * Folder filter, search and sort. Search and sort only appear on galleries big enough to justify them (more than 8 photos) to avoid
 * clutter on tiny ones; the folder filter appears whenever there are subfolders. Rendered in the toolbar on desktop and in its own row on phones.
 */
export function ExtraControls({
  subfolders, activeFolder, onFolderChange, showSearchSort, search, onSearchChange, sort, onSortChange,
}: {
  subfolders: DriveFolder[];
  activeFolder: string | null;
  onFolderChange: (name: string | null) => void;
  showSearchSort: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  sort: GallerySort;
  onSortChange: (s: GallerySort) => void;
}) {
  const { t } = useLanguage();
  const g = t.gallery;
  return (
  <>
    <FolderDropdown
      subfolders={subfolders}
      activeFolder={activeFolder}
      onChange={onFolderChange}
      allLabel={g.filterAll}
      folderLabel={g.filterFolder}
    />
    {showSearchSort && (
      <>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={g.searchPlaceholder}
            aria-label={g.searchPlaceholder}
            className="w-36 sm:w-40 bg-stone-100 border border-stone-200 rounded-xl pl-8 pr-3 py-1.5 text-xs sm:text-sm text-stone-700 placeholder-stone-400 outline-none focus:border-[#17509e]/50 focus:bg-white transition-all"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              aria-label={g.cancel}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as GallerySort)}
          aria-label={g.sortDefault}
          className="bg-stone-100 border border-stone-200 rounded-xl px-2.5 py-1.5 text-xs sm:text-sm text-stone-600 outline-none focus:border-[#17509e]/50 cursor-pointer transition-all"
        >
          <option value="default">{g.sortDefault}</option>
          <option value="name">{g.sortNameAZ}</option>
          <option value="nameDesc">{g.sortNameZA}</option>
        </select>
      </>
    )}
    </>
  );
}
