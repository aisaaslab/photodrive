"use client";

import { useState } from "react";
import { DriveFile, DriveFolder } from "@/lib/drive/types";
import { useLanguage } from "@/lib/i18n";
import {
  filterAndSort, inFolder, isImage, isVideo, viewKey,
  type GalleryFilter, type GallerySort,
} from "@/lib/gallery/view";
import { Lightbox } from "./Lightbox";
import { SendSelectionModal } from "./SendSelectionModal";
import { GalleryToolbar } from "./GalleryToolbar";
import { SelectionBar } from "./SelectionBar";
import { PhotoGrid } from "./PhotoGrid";
import { SendSelectionButton } from "./SendSelectionButton";
import { FavoritesSharedNote, NoFavorites, NoSearchResults } from "./GalleryNotices";
import { useFavorites } from "./useFavorites";
import { useGalleryDownloads } from "./useGalleryDownloads";
import { useProgressiveLimit } from "./useProgressiveLimit";

interface Props {
  photos: DriveFile[];
  subfolders?: DriveFolder[];
  galleryId: string;
  allowDownload?: boolean;
}

/**
 * The client gallery: filter, search, sort and folder controls, the grid, selection mode, favourites, downloads and the lightbox.
 * The pieces live next to it (S5-08): view rules in lib/gallery/view.ts, favourites / downloads / progressive loading as hooks, and
 * the toolbar, selection bar, grid and notices as components. This file only holds the state they share and puts them together.
 */
export function MasonryGrid({ photos, subfolders = [], galleryId, allowDownload = true }: Props) {
  const { t } = useLanguage();
  const g = t.gallery;
  // The lightbox navigates the photos that were on screen when it opened (the
  // filtered/sorted `displayed` list), not the whole gallery — so with the
  // Favorites tab open, next/prev walks favorites only. It's a snapshot so
  // un-favoriting a photo while viewing it doesn't pull it out from under you.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxPhotos, setLightboxPhotos] = useState<DriveFile[]>([]);
  const [filter, setFilter] = useState<GalleryFilter>("all");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [showSend, setShowSend] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Sort + search are gallery-viewer controls. They only render when the gallery is large enough to justify them (> 8 photos).
  const [sort, setSort] = useState<GallerySort>("default");
  const [search, setSearch] = useState("");

  const { favorites, toggleFavorite } = useFavorites(galleryId, photos);
  const { zipping, zipProgress, downloadFiles, downloadAll } = useGalleryDownloads(galleryId, photos);

  const folderPhotos = inFolder(photos, activeFolder);
  const displayed = filterAndSort(folderPhotos, { filter, favorites, search, sort });
  const { shown, hasMore, remaining, showMore, sentinelRef } = useProgressiveLimit(displayed, viewKey(filter, activeFolder, search, sort));
  const indexById = new Map(displayed.map((p, i) => [p.id, i]));

  function toggleSelect(photoId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  function toggleSelectionMode() {
    setSelectionMode((v) => !v);
    setSelected(new Set());
  }

  function selectAll() {
    if (selected.size === displayed.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(displayed.map((p) => p.id)));
    }
  }

  function openPhoto(index: number) {
    setLightboxPhotos(displayed);
    setLightboxIndex(index);
  }

  return (
    <div>
      <GalleryToolbar
        displayed={displayed}
        photoCount={folderPhotos.filter(isImage).length}
        videoCount={folderPhotos.filter(isVideo).length}
        filter={filter}
        onFilterChange={setFilter}
        favoritesCount={favorites.size}
        subfolders={subfolders}
        activeFolder={activeFolder}
        onFolderChange={setActiveFolder}
        showSearchSort={photos.length > 8}
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        allowDownload={allowDownload}
        selectionMode={selectionMode}
        allSelected={selected.size === displayed.length}
        onDownloadAll={downloadAll}
        onSelectAll={selectAll}
        onToggleSelectionMode={toggleSelectionMode}
      />

      {selectionMode && selected.size > 0 && (
        <SelectionBar count={selected.size} zipping={zipping} zipProgress={zipProgress} onDownload={() => downloadFiles([...selected])} />
      )}

      {filter === "favorites" && displayed.length > 0 && <FavoritesSharedNote />}
      {filter === "favorites" && displayed.length === 0 && <NoFavorites />}
      {search && displayed.length === 0 && filter !== "favorites" && <NoSearchResults />}

      {displayed.length > 0 && (
        <PhotoGrid
          shown={shown}
          indexById={indexById}
          galleryId={galleryId}
          favorites={favorites}
          selected={selected}
          selectionMode={selectionMode}
          allowDownload={allowDownload}
          onOpen={openPhoto}
          onToggleFavorite={toggleFavorite}
          onToggleSelect={toggleSelect}
        />
      )}

      {/* Progressive loading: the sentinel triggers the next page on scroll;
          the button is the fallback (and works without IntersectionObserver). */}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          <button
            onClick={showMore}
            className="px-5 py-2.5 rounded-xl border border-stone-300 text-sm font-medium text-stone-600 hover:text-stone-900 hover:border-stone-400 bg-white transition-all"
          >
            {g.loadMore} ({remaining})
          </button>
        </div>
      )}

      {favorites.size > 0 && !selectionMode && lightboxIndex === null && !showSend && (
        <SendSelectionButton count={favorites.size} onClick={() => setShowSend(true)} />
      )}

      {showSend && (
        <SendSelectionModal galleryId={galleryId} count={favorites.size} onClose={() => setShowSend(false)} />
      )}

      {lightboxIndex !== null && (
        <Lightbox
          galleryId={galleryId}
          photos={lightboxPhotos}
          activeIndex={lightboxIndex}
          favorites={favorites}
          allowDownload={allowDownload}
          onClose={() => setLightboxIndex(null)}
          onNext={() => setLightboxIndex((i) => Math.min((i ?? 0) + 1, lightboxPhotos.length - 1))}
          onPrev={() => setLightboxIndex((i) => Math.max((i ?? 0) - 1, 0))}
          onGoTo={(i) => setLightboxIndex(Math.max(0, Math.min(i, lightboxPhotos.length - 1)))}
          onToggleFavorite={toggleFavorite}
        />
      )}
    </div>
  );
}
