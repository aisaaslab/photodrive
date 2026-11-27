"use client";

import { useLanguage } from "@/lib/i18n";

/** First thing a keyboard user tabs to: jumps past the header, hero and actions to the photos. Invisible until focused. */
export function SkipToPhotos({ targetId }: { targetId: string }) {
  const { t } = useLanguage();
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-pill focus:bg-accent focus:px-5 focus:py-2.5 focus:text-sm focus:font-bold focus:text-canvas focus:outline-2 focus:outline-offset-2 focus:outline-white"
    >
      {t.gallery.skipToPhotos}
    </a>
  );
}
