"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";

export function ExpiredScreen() {
  const { t } = useLanguage();
  const d = t.demo;
  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col items-center justify-center px-6 text-center">
      <div className="aurora-bg"><span /></div>
      <Link href="/" className="absolute top-5 left-5 z-10 flex items-center gap-2 text-white hover:text-white/70 transition-colors">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </Link>
      <div className="relative z-10 max-w-md">
        <div className="w-14 h-14 bg-[#2D6A6A]/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg className="w-7 h-7 text-[#33A39A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {d.expiredTitle}
        </h1>
        <p className="text-white/60 mb-8 leading-relaxed">{d.expiredBody}</p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 bg-white text-stone-900 font-bold px-8 py-3.5 rounded-2xl hover:bg-stone-100 transition-all hover:scale-[1.02] text-sm"
        >
          {d.expiredCta}
        </Link>
      </div>
    </div>
  );
}
