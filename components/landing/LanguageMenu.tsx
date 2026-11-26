"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage, type Lang } from "@/lib/i18n";
import { Icon } from "./Icon";
import { cn, focusRing } from "@/lib/ui/cn";

const NAMES: Record<Lang, string> = { en: "English", el: "Ελληνικά", nl: "Nederlands", de: "Deutsch", es: "Español", it: "Italiano" };
const ORDER: Lang[] = ["en", "el", "nl", "de", "es", "it"];

/**
 * Language picker of the landing design: globe, language code (nav) or name (footer), chevron. Opens a small menu; Escape and a click
 * outside close it. Choosing a language loads only that dictionary and remembers it (lib/i18n).
 */
export function LanguageMenu({ variant = "nav", direction = "down", align = "right" }: { variant?: "nav" | "footer"; direction?: "down" | "up"; align?: "left" | "right" }) {
  const { lang, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={`Language: ${NAMES[lang]}`}
        onClick={() => setOpen((v) => !v)}
        className={cn("inline-flex items-center gap-1 rounded-pill px-1 py-1 text-fg-muted hover:text-fg transition-colors", variant === "nav" ? "text-sm font-medium" : "text-[15px] gap-1.5", focusRing)}
      >
        <Icon name="globe-muted" size={16} />
        <span>{variant === "nav" ? lang.toUpperCase() : NAMES[lang]}</span>
        <Icon name="chevron-muted" size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul role="listbox" aria-label="Language" className={cn("absolute z-50 min-w-40 rounded-tile border border-line bg-surface-2 p-1 shadow-chip", align === "left" ? "left-0" : "right-0", direction === "up" ? "bottom-full mb-2" : "top-full mt-2")}>
          {ORDER.map((code) => (
            <li key={code} role="option" aria-selected={code === lang}>
              <button
                type="button" onClick={() => { setLanguage(code); setOpen(false); }} lang={code}
                className={cn("flex w-full items-center rounded-[8px] px-3 py-2 text-left text-sm font-medium transition-colors", code === lang ? "bg-accent-soft text-accent" : "text-fg-soft hover:bg-glass hover:text-fg", focusRing)}
              >
                {NAMES[code]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
