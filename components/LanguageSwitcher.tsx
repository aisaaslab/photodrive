"use client";

import { useRef, useState, useEffect } from "react";
import { useLanguage, Lang } from "@/lib/i18n";

const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "en", label: "English",  flag: "🇬🇧" },
  { code: "el", label: "Ελληνικά", flag: "🇬🇷" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
  { code: "de", label: "Deutsch",  flag: "🇩🇪" },
  { code: "es", label: "Español",  flag: "🇪🇸" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
];

export function LanguageSwitcher({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const { lang, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isDark = variant === "dark";

  const current = LANGS.find((l) => l.code === lang)!;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 text-sm font-bold rounded-full px-3 py-1.5 transition-all ${
          isDark
            ? "bg-white text-stone-900 hover:bg-stone-100"
            : "bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 hover:border-stone-300"
        }`}
      >
        <span className="text-base leading-none">{current.flag}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-stone-200 rounded-xl shadow-lg py-1 min-w-[160px]">
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => { setLanguage(l.code); setOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2.5 transition-colors ${
                lang === l.code ? "text-[#2dabe0] font-semibold bg-[#e6f4fa]" : "text-stone-700 hover:bg-stone-50"
              }`}
            >
              <span>{l.flag}</span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
