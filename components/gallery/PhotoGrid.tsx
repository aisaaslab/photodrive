"use client";

import type { DriveFile } from "@/lib/drive/types";
import { isVideo } from "@/lib/gallery/view";
import { PhotoTile } from "./PhotoTile";

interface Props {
  /** The photos to render now (the visible window of the displayed list). */
  shown: DriveFile[];
  /** Position of each photo in the whole displayed list: what the lightbox opens at. */
  indexById: Map<string, number>;
  galleryId: string;
  favorites: Set<string>;
  selected: Set<string>;
  selectionMode: boolean;
  allowDownload: boolean;
  onOpen: (index: number) => void;
  onToggleFavorite: (photoId: string) => void;
  onToggleSelect: (photoId: string) => void;
}

/** The masonry of photos, with videos in their own, wider grid below. */
export function PhotoGrid({ shown, indexById, galleryId, favorites, selected, selectionMode, allowDownload, onOpen, onToggleFavorite, onToggleSelect }: Props) {
  const photoItems = shown.filter((p) => !isVideo(p));
  const videoItems = shown.filter(isVideo);
  const tile = (photo: DriveFile) => (
    <PhotoTile
      key={photo.id}
      galleryId={galleryId}
      photo={photo}
      index={indexById.get(photo.id) ?? 0}
      isFavorited={favorites.has(photo.id)}
      isSelected={selected.has(photo.id)}
      selectionMode={selectionMode}
      allowDownload={allowDownload}
      onOpen={onOpen}
      onToggleFavorite={onToggleFavorite}
      onToggleSelect={onToggleSelect}
    />
  );
  return (
    <>
      {photoItems.length > 0 && <div className="photo-grid">{photoItems.map(tile)}</div>}
      {videoItems.length > 0 && (
        <div className={`grid gap-2.5 mt-2.5 ${videoItems.length === 1 ? "grid-cols-1 max-w-xl" : "grid-cols-1 sm:grid-cols-2"}`}>
          {videoItems.map(tile)}
        </div>
      )}
    </>
  );
}
