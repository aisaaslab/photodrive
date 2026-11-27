"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { Logo } from "@/components/ui/Logo";

/**
 * Shown when a page crashes while rendering: branded, in the visitor's language, with a way to try again and a way out. Nothing about
 * the error itself is shown to the visitor (the framework's digest is only for the logs).
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLanguage();
  const n = t.notFound;
  useEffect(() => { console.error("page error", error.digest ?? "", error.message); }, [error]);

  return (
    <main className="bg-canvas text-fg flex min-h-screen flex-col">
      <nav className="border-b border-line bg-canvas/90">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-6">
          <Link href="/" className="rounded-tile"><Logo className="h-9" /></Link>
        </div>
      </nav>
      <div className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="max-w-md text-center">
          <h1 className="mb-3 text-3xl font-bold" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{n.errorTitle}</h1>
          <p className="mb-8 leading-relaxed text-fg-muted">{n.errorBody}</p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-pill bg-accent px-6 py-3 font-semibold text-canvas transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              {n.errorRetry}
            </button>
            <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-fg-muted/30 px-6 py-3 font-semibold text-fg transition hover:bg-surface-2">
              {n.errorHome}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
