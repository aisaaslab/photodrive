"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Last-resort screen for an error in the root layout itself (where app/error.tsx cannot render). Reports it to monitoring (a no-op until
 * a DSN is set) and shows a plain, language-neutral page: this component replaces the whole document, so none of the app's providers exist.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <html lang="en">
      <body style={{ background: "#05070b", color: "#fff", fontFamily: "system-ui, sans-serif", display: "grid", minHeight: "100vh", placeItems: "center", margin: 0, padding: 24, textAlign: "center" }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ color: "#9aa4b2", marginBottom: 24 }}>Your galleries and photos are safe. Please try again.</p>
          <button onClick={reset} style={{ background: "#2dabe0", color: "#05070b", border: 0, borderRadius: 999, padding: "12px 24px", fontWeight: 700, cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
