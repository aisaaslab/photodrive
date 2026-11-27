"use client";

import { LOCALES, useLanguage } from "@/lib/i18n";
import type { StatsSummary } from "@/lib/gallery/stats";

const ICONS = {
  views: "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  downloads: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3",
  favorites: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z",
} as const;

/** Views, downloads and favourites of a gallery, and when it was last opened (S10-02). Counts only: nothing about who the visitors were. */
export function GalleryStatsLine({ stats }: { stats?: StatsSummary }) {
  const { t, lang } = useLanguage();
  const c = t.galleryCard;
  const nf = new Intl.NumberFormat(LOCALES[lang], { notation: "compact", maximumFractionDigits: 1 });
  const items = [
    { key: "views", label: c.statsViews, n: stats?.views ?? 0 },
    { key: "downloads", label: c.statsDownloads, n: stats?.downloads ?? 0 },
    { key: "favorites", label: c.statsFavorites, n: stats?.favorites ?? 0 },
  ] as const;
  const last = stats?.lastViewAt
    ? c.statsLastVisit.replace("{date}", new Date(stats.lastViewAt).toLocaleDateString(LOCALES[lang], { dateStyle: "medium" }))
    : c.statsNoVisits;
  return (
    <div data-ui="gallery-stats" className="mt-2 mb-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
      <ul className="flex items-center gap-3">
        {items.map((it) => (
          <li key={it.key} className="inline-flex items-center gap-1" title={it.label}>
            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[it.key]} />
            </svg>
            <span className="sr-only">{it.label}: </span>
            <span className="tabular-nums">{nf.format(it.n)}</span>
          </li>
        ))}
      </ul>
      <span>{last}</span>
    </div>
  );
}
