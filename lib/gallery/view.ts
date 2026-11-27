import type { DriveFile } from "@/lib/drive/types";

/** Pure rules for what the gallery grid shows (S5-08): which photos, in which order. No React, so they are unit-tested. */
export type GalleryFilter = "all" | "photos" | "videos" | "favorites";
export type GallerySort = "default" | "name" | "nameDesc";

export const isVideo = (p: Pick<DriveFile, "mimeType">) => p.mimeType.startsWith("video/");
export const isImage = (p: Pick<DriveFile, "mimeType">) => p.mimeType.startsWith("image/");

/** The photos of one subfolder, or all of them when no folder is chosen. */
export function inFolder(photos: DriveFile[], activeFolder: string | null): DriveFile[] {
  return activeFolder ? photos.filter((p) => p.folder === activeFolder) : photos;
}

/**
 * What is displayed: the type filter first, then the search (a case-insensitive match on the file name, so "Favorites + search"
 * works together), then the sort. The default order is Drive's own (by name, natural). Never mutates its input.
 */
export function filterAndSort(
  folderPhotos: DriveFile[],
  { filter, favorites, search, sort }: { filter: GalleryFilter; favorites: Set<string>; search: string; sort: GallerySort },
): DriveFile[] {
  return (
    filter === "favorites"
      ? folderPhotos.filter((p) => favorites.has(p.id))
      : filter === "photos"
        ? folderPhotos.filter(isImage)
        : filter === "videos"
          ? folderPhotos.filter(isVideo)
          : folderPhotos
  )
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .slice()
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, undefined, { numeric: true });
      if (sort === "nameDesc") return b.name.localeCompare(a.name, undefined, { numeric: true });
      return 0;
    });
}

/** "12 photos", "1 video", or "12 photos · 3 videos": a mixed view does not call videos "photos". */
export function countLabel(displayed: DriveFile[], words: { photo: string; photos: string; video: string; videos: string }): string {
  const videos = displayed.filter(isVideo).length;
  const photos = displayed.length - videos;
  const photoPart = `${photos} ${photos === 1 ? words.photo : words.photos}`;
  const videoPart = `${videos} ${videos === 1 ? words.video : words.videos}`;
  return videos === 0 ? photoPart : photos === 0 ? videoPart : `${photoPart} · ${videoPart}`;
}

/** The grid's progressive-rendering key: the visible window starts over whenever any of these change. */
export const viewKey = (filter: GalleryFilter, activeFolder: string | null, search: string, sort: GallerySort) =>
  `${filter}|${activeFolder ?? ""}|${search}|${sort}`;
