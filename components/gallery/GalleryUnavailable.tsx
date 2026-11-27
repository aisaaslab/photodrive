"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Logo } from "@/components/ui/Logo";

/**
 * What a visitor sees for a gallery that an administrator has turned off (S7-06). Neutral and polite: it does not say why, does not
 * promise the gallery will return, and is not indexed (see generateMetadata on the gallery page). The same words are used wherever the gallery is requested.
 */
export function GalleryUnavailable() {
  const { t } = useLanguage();
  return (
    <main className="min-h-screen bg-canvas flex flex-col">
      <div className="px-4 sm:px-8 py-4 sm:py-6 flex items-center justify-between">
        <Link href="/" aria-label="PhotoDrive"><Logo /></Link>
        <LanguageSwitcher variant="light" />
      </div>
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div data-ui="gallery-unavailable" className="w-full max-w-sm text-center">
          <div className="flex items-center justify-center mb-8">
            <div className="w-12 h-12 border border-line rounded-card flex items-center justify-center bg-surface">
              <svg aria-hidden className="w-5 h-5 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 3l18 18" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-fg mb-3 leading-tight" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{t.gallery.unavailableTitle}</h1>
          <p className="text-fg-muted text-sm leading-relaxed">{t.gallery.unavailableBody}</p>
        </div>
      </div>
    </main>
  );
}
