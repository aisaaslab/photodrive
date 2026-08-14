"use client";

import { useLanguage } from "@/lib/i18n";

/**
 * The demo page is an async server component, so it cannot call useLanguage
 * itself. This renders just the heading in the visitor's language.
 */
export function DemoTitle() {
  const { t } = useLanguage();
  return (
    <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
      {t.demo.galleryTitle}
    </h1>
  );
}
