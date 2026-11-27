"use client";

import { useLanguage } from "@/lib/i18n";

/** A quiet "View photos" link at the bottom of the hero that scrolls to the grid (smooth unless the visitor prefers reduced motion). */
export function ViewPhotosCue({ targetId }: { targetId: string }) {
  const { t } = useLanguage();
  return (
    <a
      href={`#${targetId}`}
      className="mt-5 inline-flex items-center gap-1.5 rounded-pill border border-white/25 bg-black/30 px-4 py-2 text-xs font-semibold text-fg backdrop-blur transition hover:bg-black/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {t.gallery.viewPhotos}
      <svg aria-hidden className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
    </a>
  );
}
