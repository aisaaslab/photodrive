"use client";

import { LOCALES, useLanguage } from "@/lib/i18n";
import type { GalleryDoc } from "@/lib/firestore/types";

/**
 * Whether visitors can open a gallery right now, on its card (S9-04, S9-05): its own expiry date (coming up, or already past), the
 * 14 days of grace after the owner's plan ended, or offline because the plan lapsed. Says nothing for an ordinary online gallery.
 */
export function GalleryAvailabilityLine({ gallery }: { gallery: Pick<GalleryDoc, "expiresAt" | "availability"> }) {
  const { t, lang } = useLanguage();
  const c = t.galleryCard;
  const fmt = (ms: number) => new Date(ms).toLocaleDateString(LOCALES[lang], { dateStyle: "medium", timeZone: "UTC" });
  const a = gallery.availability;

  let text: string | null = null;
  let tone: "bad" | "warn" | "info" = "info";
  if (a?.state === "unavailable") {
    tone = "bad";
    text = a.reason === "expired" && gallery.expiresAt ? c.offlineExpired.replace("{date}", fmt(gallery.expiresAt)) : a.reason === "lapsed" ? c.offlineLapsed : null;
  } else if (a?.state === "grace") {
    tone = "warn";
    text = c.graceBadge.replace("{date}", fmt(a.graceEndsAt));
  } else if (gallery.expiresAt) {
    text = c.expiresBadge.replace("{date}", fmt(gallery.expiresAt));
  }
  if (!text) return null;
  const cls = tone === "bad" ? "border-red-500/30 bg-red-500/10 text-red-300" : tone === "warn" ? "border-amber-400/30 bg-amber-400/10 text-amber-300" : "border-line bg-surface text-fg-muted";
  return (
    <p data-ui="gallery-availability" data-state={a?.state ?? "available"} className={`mt-2 inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${cls}`}>
      <span className="truncate">{text}</span>
    </p>
  );
}
