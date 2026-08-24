"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { APP_NAME } from "@/lib/branding";

/**
 * Shown for any unmatched route, and for the notFound() calls in the gallery
 * and demo pages â€” so a client who opens a deleted or mistyped gallery link
 * lands somewhere branded and in their own language, instead of on the
 * framework's default white English page.
 */
export default function NotFound() {
  const { t } = useLanguage();
  const n = t.notFound;

  return (
    <main className="bg-[#080808] text-white min-h-screen flex flex-col">
      <div className="aurora-bg"><span /></div>

      <nav className="relative z-10 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-bold text-white" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
            {APP_NAME}
          </Link>
          <LanguageSwitcher />
        </div>
      </nav>

      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-20">
        <div className="text-center max-w-md">
          <p className="text-[#2dabe0] text-sm font-semibold tracking-widest uppercase mb-4">404</p>
          <h1 className="text-3xl font-bold mb-3" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
            {n.title}
          </h1>
          <p className="text-stone-400 leading-relaxed mb-8">{n.body}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-white text-stone-900 font-semibold px-6 py-3 rounded-full hover:bg-stone-100 transition-all"
            >
              {n.back}
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 border border-white/20 text-white font-semibold px-6 py-3 rounded-full hover:bg-white/10 transition-all"
            >
              {n.dashboard}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
