"use client";

import { useState } from "react";
import { useLanguage, LOCALES } from "@/lib/i18n";
import type { GalleryDoc } from "@/lib/firestore/types";
import { isPrivate } from "@/lib/gallery/visibility";
import { driveFileThumbUrl } from "@/lib/drive/public-url";
import { coverObjectPosition } from "@/lib/gallery/cover-position";
import { proxyUrl } from "@/lib/drive/proxy-url";
import { galleryUrl } from "@/lib/gallery/gallery-settings";
import { usePopoverMenu } from "./usePopoverMenu";

interface Props {
  gallery: GalleryDoc;
  copied: boolean;
  /** The client has new favourites or a new submission since the photographer last looked. */
  hasNewSelections: boolean;
  onChooseCover: () => void;
  onCopyLink: () => void;
  onOpenSelections: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const menuItemCls =
  "w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left text-white/80 hover:bg-white/[0.07] hover:text-white transition-colors";

/** What a gallery looks like in the dashboard list: cover, name, visibility badge (with a password reminder), and its actions. */
export function GalleryCardFace({ gallery, copied, hasNewSelections, onChooseCover, onCopyLink, onOpenSelections, onEdit, onDelete }: Props) {
  const { t, lang } = useLanguage();
  const c = t.galleryCard;
  const [showPassword, setShowPassword] = useState(false);
  const { menuOpen, setMenuOpen, menuRef } = usePopoverMenu();
  const createdDate = gallery.createdAt
    ? new Date(gallery.createdAt).toLocaleDateString(LOCALES[lang], {
        day: "numeric", month: "short", year: "numeric",
      })
    : null;

  return (
  <div className="bg-[#111111] border border-white/[0.08] rounded-2xl overflow-hidden hover:border-white/[0.18] transition-all duration-200 group animate-fade-up">
          {/* Cover banner — shows the chosen cover photo, or a branded
              gradient if no cover is set. Clicking it opens the cover
              picker directly (no need to enter edit mode first). */}
          <button
            onClick={() => onChooseCover()}
            className="relative w-full h-32 overflow-hidden block"
            title={c.chooseCover}
          >
            {gallery.coverFileId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={driveFileThumbUrl(gallery.coverFileId, 400)}
                alt=""
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                style={{ objectPosition: coverObjectPosition(gallery.coverPosX, gallery.coverPosY) }}
                onError={(e) => {
                  // Fallback to our proxy if Google's thumbnail CDN fails.
                  const img = e.currentTarget;
                  if (!img.dataset.fallback && gallery.coverFileId) {
                    img.dataset.fallback = "1";
                    img.src = proxyUrl(gallery.id, gallery.coverFileId, "thumb");
                  }
                }}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[#17509e] via-[#0d2d5c] to-stone-800" />
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 text-stone-900 text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.508 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.066-.75-1.993-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                </svg>
                {c.chooseCover}
              </div>
            </div>
          </button>

          {/* Card body */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-semibold text-white text-sm leading-snug truncate flex-1">{gallery.name}</h3>
              {isPrivate(gallery) ? (
                <button
                  onClick={() => setShowPassword((v) => !v)}
                  className="shrink-0 bg-white/[0.06] text-white/70 text-xs px-2 py-0.5 rounded-full flex items-center gap-1 border border-white/10 hover:bg-white/[0.10] transition-colors"
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  {showPassword && gallery.password
                    ? <span className="font-mono tracking-wider">{gallery.password}</span>
                    : c.password
                  }
                </button>
              ) : (
                <span className="shrink-0 bg-white/[0.04] text-white/50 text-xs px-2 py-0.5 rounded-full flex items-center gap-1 border border-white/10">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.5-2.4 3.75-5.4 3.75-9S14.5 5.4 12 3m0 18c-2.5-2.4-3.75-5.4-3.75-9S9.5 5.4 12 3m-9 9h18" />
                  </svg>
                  {c.publicBadge}
                </span>
              )}
            </div>
            {createdDate && (
              <p className="text-xs text-white/50 mt-0.5 mb-4">{createdDate}</p>
            )}

            {/* Copy link — primary action, full width so it's the obvious
                thing to click after creating a gallery. */}
            <button
              onClick={onCopyLink}
              className={`w-full flex items-center justify-center gap-1.5 text-xs rounded-lg py-2.5 transition-all font-semibold border ${
                copied
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "bg-white text-stone-900 border-transparent hover:bg-stone-100"
              }`}
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {c.copied}
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                  {c.copyLink}
                </>
              )}
            </button>

    {/* Secondary actions. Two labeled buttons (icons alone aren't
        discoverable on touch) + a "more" menu for the rarer ones. */}
    <div className="mt-2 flex gap-2">
      <a
        href={galleryUrl(gallery)}
        target="_blank"
        rel="noopener noreferrer"
        title={c.openGallery}
        className="flex-1 min-w-0 flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium text-white/70 hover:text-white border border-white/10 hover:border-white/25 hover:bg-white/[0.05] rounded-lg transition-colors"
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
        <span className="truncate">{t.gallery.open}</span>
      </a>

      <button
        onClick={onOpenSelections}
        title={c.selections}
        className="relative flex-1 min-w-0 flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium text-white/70 hover:text-[#2dabe0] border border-white/10 hover:border-[#2dabe0]/40 hover:bg-[#17509e]/15 rounded-lg transition-colors"
      >
        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill={(gallery.selectionCount ?? 0) > 0 ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
        </svg>
        <span className="truncate">{t.gallery.filterFavorites}</span>
        {(gallery.selectionCount ?? 0) > 0 && (
          <span
            className={`shrink-0 min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
              hasNewSelections ? "bg-[#2dabe0] text-white" : "bg-white/10 text-white/70"
            }`}
          >
            {gallery.selectionCount}
            {gallery.selectionSubmittedAt && (
              <svg className="w-2.5 h-2.5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-label={c.selectionSent}>
                <title>{c.selectionSent}</title>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
          </span>
        )}
        {hasNewSelections && (
          <span className="absolute -top-1.5 -right-1.5 bg-[#2dabe0] text-white text-[9px] font-bold leading-none rounded-full px-1.5 py-1 shadow">
            {c.newBadge}
          </span>
        )}
      </button>

      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={c.more}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="h-full aspect-square min-w-9 flex items-center justify-center text-white/70 hover:text-white border border-white/10 hover:border-white/25 hover:bg-white/[0.05] rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 bottom-full mb-1.5 z-20 w-44 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl py-1 animate-scale-in"
          >
            <button role="menuitem" className={menuItemCls} onClick={() => { setMenuOpen(false); onChooseCover(); }}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25z" />
              </svg>
              {c.chooseCover}
            </button>
            <button role="menuitem" className={menuItemCls} onClick={() => { setMenuOpen(false); onEdit(); }}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
              {c.edit}
            </button>
            <div className="my-1 h-px bg-white/10" />
            <button
              role="menuitem"
              className={`${menuItemCls} hover:!bg-red-500/10 hover:!text-red-400`}
              onClick={() => { setMenuOpen(false); onDelete(); }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              {c.delete}
            </button>
          </div>
        )}
      </div>
    </div>
    </div>
  </div>
  );
}
