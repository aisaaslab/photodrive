"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Logo } from "@/components/ui/Logo";

/**
 * Shown for any unmatched route, and for the notFound() calls in the gallery
 * and demo pages — so a client who opens a deleted or mistyped gallery link
 * lands somewhere branded and in their own language, instead of on the
 * framework's default white English page.
 */
export default function NotFound() {
  const { t } = useLanguage();
  const n = t.notFound;

  return (
    <main className="bg-canvas text-fg min-h-screen flex flex-col">
      

      <nav className="relative z-10 border-b border-line bg-canvas/90 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="rounded-tile"><Logo className="h-9" /></Link>
          <LanguageSwitcher />
        </div>
      </nav>

      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-20">
        <div className="text-center max-w-md">
          <p className="text-accent text-sm font-semibold tracking-widest uppercase mb-4">404</p>
          <h1 className="text-3xl font-bold mb-3" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
            {n.title}
          </h1>
          <p className="text-fg-muted leading-relaxed mb-8">{n.body}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-accent text-canvas font-semibold px-6 py-3 rounded-pill hover:brightness-110 transition-all"
            >
              {n.back}
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 border border-fg-muted/30 text-fg font-semibold px-6 py-3 rounded-full hover:bg-surface-2 transition-all"
            >
              {n.dashboard}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
