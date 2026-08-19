"use client";

import { useState, useEffect, useRef } from "react";
import { DriveFile, DriveFolder } from "@/lib/drive/types";
import { PhotoTile } from "./PhotoTile";
import { Lightbox } from "./Lightbox";
import { nanoid } from "nanoid";
import { useLanguage } from "@/lib/i18n";

interface Props {
  photos: DriveFile[];
  subfolders?: DriveFolder[];
  galleryId: string;
  allowDownload?: boolean;
}

const SESSION_KEY = "gallery_session_id";
// Must match PART_SIZE on the server route so the number of parts agrees.
const PART_SIZE = 300;

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = nanoid();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

type Filter = "all" | "photos" | "videos" | "favorites";

export function MasonryGrid({ photos, subfolders = [], galleryId, allowDownload = true }: Props) {
  const { t } = useLanguage();
  const g = t.gallery;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false);
  const folderDropdownRef = useRef<HTMLDivElement>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  useEffect(() => {
    getSessionId();
    const key = `favorites_${galleryId}`;
    const stored = localStorage.getItem(key);
    if (stored) setFavorites(new Set(JSON.parse(stored)));
    // Shared favourites: load the gallery's selection from the server so anyone
    // who opens the link sees the same favourited photos (and so does the
    // photographer). No account needed.
    fetch(`/api/galleries/${galleryId}/selection`)
      .then((r) => r.json())
      .then((data: { photos?: { id: string }[] }) => {
        const ids = (data.photos ?? []).map((p) => p.id);
        setFavorites(new Set(ids));
        localStorage.setItem(key, JSON.stringify(ids));
      })
      .catch(() => {});
  }, [galleryId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (folderDropdownRef.current && !folderDropdownRef.current.contains(e.target as Node)) {
        setFolderDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function saveFavorites(next: Set<string>) {
    localStorage.setItem(`favorites_${galleryId}`, JSON.stringify([...next]));
  }

  function toggleFavorite(photoId: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      const adding = !next.has(photoId);
      if (adding) next.add(photoId);
      else next.delete(photoId);
      saveFavorites(next);
      // Update the shared selection on the server so every visitor (and the
      // photographer) sees the change.
      const photo = photos.find((p) => p.id === photoId);
      fetch(`/api/galleries/${galleryId}/selection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: adding ? "add" : "remove",
          item: { id: photoId, name: photo?.name ?? "" },
        }),
        keepalive: true,
      }).catch(() => {});
      return next;
    });
  }

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

  async function downloadFiles(ids: string[]) {
    if (zipping) return;
    setZipping(true);
    setZipProgress(0);
    try {
      // Loaded on demand so the ~100KB zip library isn't shipped on every gallery view.
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      // Fetch in small batches instead of all at once: hundreds of parallel
      // full-size requests overwhelm the browser/connection and look "stuck".
      // A failed file is skipped rather than aborting the whole download.
      const CONCURRENCY = 4;
      let done = 0;
      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        const batch = ids.slice(i, i + CONCURRENCY);
        await Promise.all(
          batch.map(async (id) => {
            const photo = photos.find((p) => p.id === id);
            try {
              const res = await fetch(`/api/photos/proxy?fileId=${id}&size=full`);
              if (res.ok) zip.file(photo?.name ?? `${id}.jpg`, await res.blob());
            } catch {
              // skip this file, keep the rest
            }
            setZipProgress(++done);
          })
        );
      }
      // STORE = no recompression. Photos/videos are already compressed, so
      // deflating them just burns CPU/time for almost no size gain.
      const content = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = "photos.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setZipping(false);
    }
  }

  function downloadSelected() {
    downloadFiles([...selected]);
  }

  // "Download all" via the server (streams a zip, never leaves the site). Huge
  // galleries are split into parts. All parts are triggered inside the same
  // click so the browser shows ONE "allow multiple downloads" prompt and
  // downloads them together; staggering with timers gets the later parts
  // blocked because they fall outside the user gesture.
  function downloadAll() {
    const total = photos.length;
    const parts = Math.max(1, Math.ceil(total / PART_SIZE));
    for (let p = 1; p <= parts; p++) {
      const url =
        parts === 1
          ? `/api/galleries/${galleryId}/download-all`
          : `/api/galleries/${galleryId}/download-all?part=${p}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  const folderFiltered = activeFolder
    ? photos.filter((p) => p.folder === activeFolder)
    : photos;

  const photoCount = folderFiltered.filter((p) => p.mimeType.startsWith("image/")).length;
  const videoCount = folderFiltered.filter((p) => p.mimeType.startsWith("video/")).length;

  const displayed =
    filter === "favorites"
      ? folderFiltered.filter((p) => favorites.has(p.id))
      : filter === "photos"
      ? folderFiltered.filter((p) => p.mimeType.startsWith("image/"))
      : filter === "videos"
      ? folderFiltered.filter((p) => p.mimeType.startsWith("video/"))
      : folderFiltered;

  // Count label: breaks down photos vs videos so a mixed view (e.g. "All")
  // doesn't call videos "photos".
  const shownVideos = displayed.filter((p) => p.mimeType.startsWith("video/")).length;
  const shownPhotos = displayed.length - shownVideos;
  const photoPart = `${shownPhotos} ${shownPhotos === 1 ? g.photo : g.photos}`;
  const videoPart = `${shownVideos} ${shownVideos === 1 ? g.video : g.videos}`;
  const countLabel =
    shownVideos === 0 ? photoPart : shownPhotos === 0 ? videoPart : `${photoPart} · ${videoPart}`;

  function openPhoto(index: number) {
    const photo = displayed[index];
    const globalIndex = photos.findIndex((p) => p.id === photo.id);
    setLightboxIndex(globalIndex);
  }

  return (
    <div>
      {/* Filter + controls bar */}
      <div className="flex items-center justify-between mb-6 px-1 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-stone-100 rounded-xl p-1 overflow-x-auto">
          <button
            onClick={() => setFilter("all")}
            className={`px-2 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              filter === "all"
                ? "bg-[#17509e] text-white shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {g.filterAll}
          </button>
          <button
            onClick={() => setFilter("photos")}
            className={`flex items-center gap-1.5 px-2 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              filter === "photos"
                ? "bg-[#17509e] text-white shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {g.filterPhotos}
            <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${filter === "photos" ? "bg-white/20 text-white" : "bg-[#17509e] text-white"}`}>{photoCount}</span>
          </button>
          {videoCount > 0 && (
            <button
              onClick={() => setFilter("videos")}
              className={`flex items-center gap-1.5 px-2 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                filter === "videos"
                  ? "bg-[#17509e] text-white shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {g.filterVideos}
              <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${filter === "videos" ? "bg-white/20 text-white" : "bg-[#17509e] text-white"}`}>{videoCount}</span>
            </button>
          )}
          <button
            onClick={() => setFilter("favorites")}
            className={`flex items-center gap-1.5 px-2 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              filter === "favorites"
                ? "bg-[#17509e] text-white shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={filter === "favorites" ? "white" : "none"} stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
            {g.filterFavorites}
            {favorites.size > 0 && (
              <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${filter === "favorites" ? "bg-white/20 text-white" : "bg-[#17509e] text-white"}`}>
                {favorites.size}
              </span>
            )}
          </button>
          </div>

          {/* Folder dropdown */}
          {subfolders.length > 0 && (
            <div className="relative" ref={folderDropdownRef}>
              <button
                onClick={() => setFolderDropdownOpen((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium border transition-all ${
                  activeFolder
                    ? "bg-stone-800 text-white border-stone-800"
                    : "bg-stone-100 text-stone-500 border-stone-200 hover:text-stone-700"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v8.25m19.5 0A2.25 2.25 0 0119.5 16.5h-15a2.25 2.25 0 01-2.25-2.25m19.5 0v-1.5A2.25 2.25 0 0019.5 10.5h-15" />
                </svg>
                {activeFolder ?? g.filterFolder}
                <svg className={`w-3 h-3 transition-transform ${folderDropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {folderDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-stone-200 rounded-xl shadow-lg py-1 min-w-[160px]">
                  <button
                    onClick={() => { setActiveFolder(null); setFolderDropdownOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${!activeFolder ? "text-[#2dabe0] font-semibold" : "text-stone-600 hover:bg-stone-50"}`}
                  >
                    {g.filterAll}
                  </button>
                  {subfolders.map((sf) => (
                    <button
                      key={sf.id}
                      onClick={() => { setActiveFolder(sf.name); setFolderDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${activeFolder === sf.name ? "text-[#2dabe0] font-semibold" : "text-stone-600 hover:bg-stone-50"}`}
                    >
                      {sf.path}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <p className="text-xs text-stone-600">
            {countLabel}
          </p>
          {!selectionMode && displayed.length > 0 && allowDownload && (
            <button
              onClick={downloadAll}
              className="flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 font-medium transition-all border border-stone-300 text-stone-500 hover:text-stone-700 hover:border-stone-400"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {g.downloadAll}
            </button>
          )}
          {selectionMode && (
            <button
              onClick={selectAll}
              className="flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 font-medium transition-all border border-stone-300 text-stone-600 hover:text-stone-900 hover:border-stone-400 bg-white"
            >
              {selected.size === displayed.length ? g.deselectAll : g.selectAll}
            </button>
          )}
          {allowDownload && (
            <button
              onClick={toggleSelectionMode}
              className={`flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 font-medium transition-all border ${
                selectionMode
                  ? "bg-[#17509e] border-[#17509e] text-white"
                  : "border-stone-300 text-stone-500 hover:text-stone-700 hover:border-stone-400"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {selectionMode ? g.cancel : g.select}
            </button>
          )}
        </div>
      </div>

      {/* Selection action bar */}
      {selectionMode && selected.size > 0 && (
        <div className="flex items-center justify-between mb-4 px-4 py-3 bg-stone-100 rounded-xl animate-scale-in">
          <span className="text-sm text-stone-600">
            <span className="font-semibold text-stone-900">{selected.size}</span> {g.selected}
          </span>
          <button
            onClick={downloadSelected}
            disabled={zipping}
            className="flex items-center gap-1.5 bg-stone-900 text-white text-xs font-semibold rounded-lg px-3 py-1.5 hover:bg-stone-800 transition-colors disabled:opacity-60"
          >
            {zipping ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {g.preparing} {zipProgress}/{selected.size}
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                {g.download} {selected.size} (.zip)
              </>
            )}
          </button>
        </div>
      )}

      {/* Reassurance: favourites are shared with the photographer */}
      {filter === "favorites" && displayed.length > 0 && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-[#17509e]/10 border border-[#17509e]/20 rounded-xl text-xs text-[#17509e]">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          {g.favoritesShared}
        </div>
      )}

      {/* Empty favorites state */}
      {filter === "favorites" && displayed.length === 0 && (
        <div className="text-center py-24 animate-fade-up">
          <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
          </div>
          <p className="text-stone-500 text-sm">{g.noFavorites}</p>
          <p className="text-stone-400 text-xs mt-1">{g.noFavoritesHint}</p>
        </div>
      )}

      {/* Grid */}
      {displayed.length > 0 && (() => {
        const photoItems = displayed.filter((p) => !p.mimeType.startsWith("video/"));
        const videoItems = displayed.filter((p) => p.mimeType.startsWith("video/"));
        return (
          <>
            {photoItems.length > 0 && (
              <div className="masonry-grid">
                {photoItems.map((photo) => {
                  const index = displayed.indexOf(photo);
                  return (
                    <PhotoTile
                      key={photo.id}
                      photo={photo}
                      index={index}
                      isFavorited={favorites.has(photo.id)}
                      isSelected={selected.has(photo.id)}
                      selectionMode={selectionMode}
                      allowDownload={allowDownload}
                      onOpen={openPhoto}
                      onToggleFavorite={toggleFavorite}
                      onToggleSelect={toggleSelect}
                    />
                  );
                })}
              </div>
            )}
            {videoItems.length > 0 && (
              <div className={`grid gap-2.5 mt-2.5 ${videoItems.length === 1 ? "grid-cols-1 max-w-xl" : "grid-cols-1 sm:grid-cols-2"}`}>
                {videoItems.map((video) => {
                  const index = displayed.indexOf(video);
                  return (
                    <PhotoTile
                      key={video.id}
                      photo={video}
                      index={index}
                      isFavorited={favorites.has(video.id)}
                      isSelected={selected.has(video.id)}
                      selectionMode={selectionMode}
                      allowDownload={allowDownload}
                      onOpen={openPhoto}
                      onToggleFavorite={toggleFavorite}
                      onToggleSelect={toggleSelect}
                    />
                  );
                })}
              </div>
            )}
          </>
        );
      })()}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          activeIndex={lightboxIndex}
          favorites={favorites}
          allowDownload={allowDownload}
          onClose={() => setLightboxIndex(null)}
          onNext={() => setLightboxIndex((i) => Math.min((i ?? 0) + 1, photos.length - 1))}
          onPrev={() => setLightboxIndex((i) => Math.max((i ?? 0) - 1, 0))}
          onToggleFavorite={toggleFavorite}
        />
      )}
    </div>
  );
}
