"use client";

import { Analytics } from "@vercel/analytics/next";

/**
 * Wraps Vercel Web Analytics so we can drop events coming from our own
 * browser. Run `localStorage.setItem("va-disable", "1")` once in the console
 * on any device you want excluded (and "va-disable" removeItem to re-enable).
 */
export function SiteAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => {
        if (typeof window !== "undefined" && localStorage.getItem("va-disable") === "1") {
          return null;
        }
        return event;
      }}
    />
  );
}
