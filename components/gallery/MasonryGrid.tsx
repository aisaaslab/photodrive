"use client";

import { useState, useEffect, useRef } from "react";
import { DriveFile, DriveFolder } from "@/lib/drive/types";
import { PhotoTile } from "./PhotoTile";
import { Lightbox } from "./Lightbox";
import { SendSelectionModal } from "./SendSelectionModal";
import { nanoid } from "nanoid";
import { useLanguage } from "@/lib/i18n";
import { proxyUrl } from "@/lib/drive/proxy-url";

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

/**
 * Subfolder filter. Self-contained (own open state and outside-click handling)
 * so it can be rendered in both the desktop and the mobile controls row.
 */
function FolderDropdown({
  subfolders, activeFolder, onChange, allLabel, folderLabel,
}: {
  subfolders: DriveFolder[];
  activeFolder: string | null;
  onChange: (name: string | null) => void;
  allLabel: string;
  folderLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (subfolders.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium border transition-all ${
          activeFolder
            ? "bg-stone-800 text-white border-stone-800"
            : "bg-stone-100 text-stone-500 border-stone-200 hover:text-stone-700"
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v8.25m19.5 0A2.25 2.25 0 0119.5 16.5h-15a2.25 2.25 0 01-2.25-2.25m19.5 0v-1.5A2.25 2.25 0 0019.5 10.5h-15" />
        </svg>
        {activeFolder ?? folderLabel}
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div role="listbox" className="absolute top-full left-0 mt-1 z-40 bg-white border border-stone-200 rounded-xl shadow-lg py-1 min-w-[160px]">
          <button
            role="option"
            aria-selected={!activeFolder}
            onClick={() => { onChange(null); setOpen(false); }}
            className={`w-full text-left px-4 py-2 text-sm transition-colors ${!activeFolder ? "text-[#2dabe0] font-semibold" : "text-stone-600 hover:bg-stone-50"}`}
          >
            {allLabel}
          </button>
          {subfolders.map((sf) => (
            <button
              key={sf.id}
              role="option"
              aria-selected={activeFolder === sf.name}
              onClick={() => { onChange(sf.name); setOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${activeFolder === sf.name ? "text-[#2dabe0] font-semibold" : "text-stone-600 hover:bg-stone-50"}`}
            >
              {sf.path}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Photos rendered per "page". Big galleries (1,000+ photos) would otherwise
// mount every tile up front; instead we render PAGE_SIZE at a time and add more
// as the visitor scrolls (with a button as a fallback).
const PAGE_SIZE = 120;

export function MasonryGrid({ photos, subfolders = [], galleryId, allowDownload = true }: Props) {
  const { t } = useLanguage();
  const g = t.gallery;
  // The lightbox navigates the photos that were on screen when it opened (the
  // filtered/sorted `displayed` list), not the whole gallery — so with the
  // Favorites tab open, next/prev walks favorites only. It's a snapshot so
  // un-favoriting a photo while viewing it doesn't pull it out from under you.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxPhotos, setLightboxPhotos] = useState<DriveFile[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [showSend, setShowSend] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  // Sort + search are gallery-viewer controls. They only render when the
  // gallery is large enough to justify them (> 8 photos) to avoid clutter on
  // tiny galleries. See the threshold check in the controls bar JSX below.
  const [sort, setSort] = useState<"default" | "name" | "nameDesc">("default");
  const [search, setSearch] = useState("");

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
              const res = await fetch(proxyUrl(galleryId, id, "full"));
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
    (filter === "favorites"
      ? folderFiltered.filter((p) => favorites.has(p.id))
      : filter === "photos"
      ? folderFiltered.filter((p) => p.mimeType.startsWith("image/"))
      : filter === "videos"
      ? folderFiltered.filter((p) => p.mimeType.startsWith("video/"))
      : folderFiltered
    )
      // Search: case-insensitive match on filename. Applied after the filter
      // so "Favorites + search" works together.
      .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
      // Sort: copy via .slice() so we never mutate the filtered array. Default
      // preserves Drive's natural order (by name ascending in the API query).
      .slice()
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name, undefined, { numeric: true });
        if (sort === "nameDesc") return b.name.localeCompare(a.name, undefined, { numeric: true });
        return 0;
      });

  // Progressive rendering. The limit resets whenever the filter/search/sort/
  // folder changes (keyed, so no effect is needed to reset it).
  const filterKey = `${filter}|${activeFolder ?? ""}|${search}|${sort}`;
  const [limitState, setLimitState] = useState({ key: filterKey, n: PAGE_SIZE });
  const limit = limitState.key === filterKey ? limitState.n : PAGE_SIZE;
  const shown = displayed.slice(0, limit);
  const hasMore = displayed.length > shown.length;
  const remaining = displayed.length - shown.length;
  const indexById = new Map(displayed.map((p, i) => [p.id, i]));

  function showMore() {
    setLimitState((st) => ({ key: filterKey, n: (st.key === filterKey ? st.n : PAGE_SIZE) + PAGE_SIZE }));
  }

  // Load the next page when the sentinel below the grid nears the viewport. The
  // effect re-subscribes after each page, so it keeps loading until the
  // sentinel is far enough below the fold.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!hasMore || !el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLimitState((st) => ({ key: filterKey, n: (st.key === filterKey ? st.n : PAGE_SIZE) + PAGE_SIZE }));
        }
      },
      { rootMargin: "1200px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, limit, filterKey]);

  // Count label: breaks down photos vs videos so a mixed view (e.g. "All")
  // doesn't call videos "photos".
  const shownVideos = displayed.filter((p) => p.mimeType.startsWith("video/")).length;
  const shownPhotos = displayed.length - shownVideos;
  const photoPart = `${shownPhotos} ${shownPhotos === 1 ? g.photo : g.photos}`;
  const videoPart = `${shownVideos} ${shownVideos === 1 ? g.video : g.videos}`;
  const countLabel =
    shownVideos === 0 ? photoPart : shownPhotos === 0 ? videoPart : `${photoPart} · ${videoPart}`;

  // Filter tab button (All / Photos / Videos). Favorites is rendered inline
  // because it has an icon and a different count rule.
  function tabBtn(value: Filter, label: string, count?: number) {
    const active = filter === value;
    return (
      <button
        onClick={() => setFilter(value)}
        aria-pressed={active}
        className={`flex items-center gap-1.5 px-2 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
          active ? "bg-[#17509e] text-white shadow-sm" : "text-stone-500 hover:text-stone-700"
        }`}
      >
        {label}
        {count !== undefined && (
          <span className={`min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${active ? "bg-white/20 text-white" : "bg-[#17509e] text-white"}`}>
            {count}
          </span>
        )}
      </button>
    );
  }

  // Search + sort only appear on galleries big enough to justify them (> 8
  // photos); the folder filter appears whenever there are subfolders.
  const hasExtraControls = subfolders.length > 0 || photos.length > 8;
  const extraControls = (
    <>
      <FolderDropdown
        subfolders={subfolders}
        activeFolder={activeFolder}
        onChange={setActiveFolder}
        allLabel={g.filterAll}
        folderLabel={g.filterFolder}
      />
      {photos.length > 8 && (
        <>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={g.searchPlaceholder}
              aria-label={g.searchPlaceholder}
              className="w-36 sm:w-40 bg-stone-100 border border-stone-200 rounded-xl pl-8 pr-3 py-1.5 text-xs sm:text-sm text-stone-700 placeholder-stone-400 outline-none focus:border-[#17509e]/50 focus:bg-white transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
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
            onChange={(e) => setSort(e.target.value as "default" | "name" | "nameDesc")}
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

  function openPhoto(index: number) {
    setLightboxPhotos(displayed);
    setLightboxIndex(index);
  }

  return (
    <div>
      {/* Filter + controls bar. Sticks under the gallery header while
          scrolling, so switching filter or selecting never needs a scroll back
          up. On phones the sticky part is just the tabs + icon actions (one
          row); search / sort / folder sit in a normal row below. */}
      <div className="sticky top-14 z-30 -mx-2 sm:-mx-6 px-3 sm:px-7 py-2 mb-3 sm:mb-5 bg-stone-50/90 backdrop-blur-md border-b border-stone-200/70">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1 bg-stone-100 rounded-xl p-1 overflow-x-auto shrink-0 max-w-full">
              {tabBtn("all", g.filterAll)}
              {tabBtn("photos", g.filterPhotos, photoCount)}
              {videoCount > 0 && tabBtn("videos", g.filterVideos, videoCount)}
              <button
                onClick={() => setFilter("favorites")}
                aria-pressed={filter === "favorites"}
                className={`flex items-center gap-1.5 px-2 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  filter === "favorites" ? "bg-[#17509e] text-white shadow-sm" : "text-stone-500 hover:text-stone-700"
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={filter === "favorites" ? "white" : "none"} stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
                <span className="hidden min-[400px]:inline">{g.filterFavorites}</span>
                {favorites.size > 0 && (
                  <span className={`min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${filter === "favorites" ? "bg-white/20 text-white" : "bg-[#17509e] text-white"}`}>
                    {favorites.size}
                  </span>
                )}
              </button>
            </div>

            {/* Desktop: folder / search / sort share the row */}
            <div className="hidden sm:flex items-center gap-2">{extraControls}</div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <p className="hidden md:block text-xs text-stone-600">{countLabel}</p>
            {!selectionMode && displayed.length > 0 && allowDownload && (
              <button
                onClick={downloadAll}
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
                onClick={selectAll}
                className="flex items-center gap-1.5 text-xs rounded-lg px-2.5 sm:px-3 py-1.5 font-medium transition-all border border-stone-300 text-stone-600 hover:text-stone-900 hover:border-stone-400 bg-white whitespace-nowrap"
              >
                {selected.size === displayed.length ? g.deselectAll : g.selectAll}
              </button>
            )}
            {allowDownload && (
              <button
                onClick={toggleSelectionMode}
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
      {hasExtraControls && <div className="sm:hidden flex items-center flex-wrap gap-2 mb-4 px-1">{extraControls}</div>}

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

      {/* Empty search state — only when a search yields nothing (and it's not
          the favorites tab, which has its own empty state above). */}
      {search && displayed.length === 0 && filter !== "favorites" && (
        <div className="text-center py-24 animate-fade-up">
          <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <p className="text-stone-500 text-sm">{g.searchPlaceholder}</p>
        </div>
      )}

      {/* Grid */}
      {displayed.length > 0 && (() => {
        const photoItems = shown.filter((p) => !p.mimeType.startsWith("video/"));
        const videoItems = shown.filter((p) => p.mimeType.startsWith("video/"));
        return (
          <>
            {photoItems.length > 0 && (
              <div className="photo-grid">
                {photoItems.map((photo) => {
                  const index = indexById.get(photo.id) ?? 0;
                  return (
                    <PhotoTile
                      key={photo.id}
                      galleryId={galleryId}
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
                  const index = indexById.get(video.id) ?? 0;
                  return (
                    <PhotoTile
                      key={video.id}
                      galleryId={galleryId}
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

      {/* "Send selection" — appears as soon as the client has favorites, on any
          tab, so the hand-off to the photographer is always one tap away. */}
      {favorites.size > 0 && !selectionMode && lightboxIndex === null && !showSend && (
        <div className="fixed bottom-4 inset-x-0 z-30 flex justify-center pointer-events-none px-4">
          <button
            onClick={() => setShowSend(true)}
            className="pointer-events-auto inline-flex items-center gap-2.5 bg-stone-900 text-white rounded-full pl-4 pr-5 py-3 text-sm font-semibold shadow-2xl hover:bg-stone-800 active:scale-[0.98] transition-all animate-fade-up"
          >
            <svg className="w-4 h-4 text-[#2dabe0]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
            <span>{favorites.size}</span>
            <span className="w-px h-4 bg-white/25" />
            {g.sendSelectionShort}
          </button>
        </div>
      )}

      {showSend && (
        <SendSelectionModal galleryId={galleryId} count={favorites.size} onClose={() => setShowSend(false)} />
      )}

      {/* Lightbox */}
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
