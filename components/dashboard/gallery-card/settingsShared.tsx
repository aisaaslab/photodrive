"use client";

import type { useLanguage } from "@/lib/i18n";

type Labels = ReturnType<typeof useLanguage>["t"]["galleryCard"];

/** The optional link rows of the settings dialog. */
export const SOCIAL_FIELDS = [
  { key: "website", placeholder: "https://yoursite.com",
    icon: (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M3.5 12h17M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" /></svg>) },
  { key: "instagram", placeholder: "https://instagram.com/username",
    icon: (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="3.8" /><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" /></svg>) },
  { key: "facebook", placeholder: "https://facebook.com/yourpage",
    icon: (<svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M22 12a10 10 0 10-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0022 12z" /></svg>) },
] as const;

export const inputCls =
  "w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-fg outline-none focus:border-fg-muted/30 transition-all placeholder:text-fg-muted";
export const sectionHeading = "text-[11px] font-semibold uppercase tracking-wider text-fg-muted";

// Short size for the live title preview in the settings dialog.
export const PREVIEW_SIZES: Record<string, string> = { sm: "1.25rem", md: "1.6rem", lg: "2rem", xl: "2.4rem" };

// Translated label for a title font id (labels live in the galleryCard i18n
// block so each language names the styles natively).
export function titleFontLabel(fid: string, labels: Labels): string {
  switch (fid) {
    case "serif": return labels.fontSerif;
    case "script": return labels.fontScript;
    case "modern": return labels.fontModern;
    case "mono": return labels.fontMono;
    default: return labels.fontClassic;
  }
}

// Translated label for a title size id.
export function titleSizeLabel(sid: string, labels: Labels): string {
  switch (sid) {
    case "sm": return labels.sizeSmall;
    case "lg": return labels.sizeLarge;
    case "xl": return labels.sizeXLarge;
    default: return labels.sizeMedium;
  }
}


