"use client";

import { useLanguage } from "@/lib/i18n";

/** Reassurance on the Favorites tab: favourites are shared with the photographer. */
export function FavoritesSharedNote() {
  const { t } = useLanguage();
  return (
    <div data-ui="favorites-note" className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-accent-deep/10 border border-accent-deep/20 rounded-xl text-xs text-accent-deep">
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
      {t.gallery.favoritesShared}
    </div>
  );
}

/** Empty Favorites tab. */
export function NoFavorites() {
  const { t } = useLanguage();
  const g = t.gallery;
  return (
    <div data-ui="empty-state" className="text-center py-24 animate-fade-up">
      <div className="w-14 h-14 bg-surface-2 rounded-card flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
        </svg>
      </div>
      <p className="text-fg-muted text-sm">{g.noFavorites}</p>
      <p className="text-fg-muted text-xs mt-1">{g.noFavoritesHint}</p>
    </div>
  );
}

/** A search that matches nothing (not shown on the Favorites tab, which has its own empty state). */
export function NoSearchResults() {
  const { t } = useLanguage();
  return (
    <div data-ui="empty-state" className="text-center py-24 animate-fade-up">
      <div className="w-14 h-14 bg-surface-2 rounded-card flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      </div>
      <p className="text-fg-soft text-sm font-semibold">{t.gallery.noResults}</p>
      <p className="text-fg-muted text-xs mt-1">{t.gallery.noResultsHint}</p>
    </div>
  );
}
