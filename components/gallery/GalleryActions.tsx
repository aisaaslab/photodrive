"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n";

/**
 * Share + Book-CTA buttons for the public gallery page.
 *
 * The gallery page is a server component, so anything that needs both client
 * interactivity (navigator.share / clipboard) AND i18n (useLanguage) must live
 * in a client island. This component renders the Share button and, if a
 * `bookUrl` is provided, the "Book this photographer" CTA — both labelled in
 * the visitor's chosen language.
 */
interface Props {
  bookUrl?: string | null;
}

export function GalleryActions({ bookUrl }: Props) {
  const { t } = useLanguage();
  const g = t.gallery;
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (!url) return;

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // AbortError (user cancelled) or failure — fall through to copy.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked (e.g. insecure context). Silently no-op.
    }
  }

  return (
    <>
      <button
        onClick={handleShare}
        className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5 transition-all border ${
          copied
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
            : "border-stone-200 bg-white text-stone-600 hover:text-[#17509e] hover:border-[#17509e]/50 hover:bg-[#eaf2fb] hover:shadow-sm"
        }`}
        aria-label={g.share}
      >
        {copied ? (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
          </svg>
        )}
        {copied ? g.shareCopied : g.share}
      </button>

      {bookUrl && (
        <a
          href={bookUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 bg-stone-900 text-white hover:bg-emerald-600 hover:shadow-sm transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v10.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 012.25 17.25V6.75zm10.5 0c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v10.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0112.75 17.25V6.75z" />
          </svg>
          {g.bookPhotographer}
        </a>
      )}
    </>
  );
}
