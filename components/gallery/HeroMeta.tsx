"use client";

import { useLanguage, LOCALES } from "@/lib/i18n";

/**
 * Subtitle line under the gallery title: description · date · location · counts.
 *
 * The gallery page is a server component, so the pieces that depend on the
 * visitor's chosen language (the "12 photos" wording and the locale-formatted
 * event date) live here in a client island.
 */
interface Props {
  description?: string;
  /** "YYYY-MM-DD" */
  eventDate?: string;
  location?: string;
  photoCount: number;
  videoCount: number;
}

export function HeroMeta({ description, eventDate, location, photoCount, videoCount }: Props) {
  const { t, lang } = useLanguage();
  const g = t.gallery;

  let date: string | null = null;
  if (eventDate) {
    try {
      date = new Intl.DateTimeFormat(LOCALES[lang], { day: "numeric", month: "long", year: "numeric" }).format(
        new Date(eventDate)
      );
    } catch {
      date = eventDate;
    }
  }

  const photoPart = `${photoCount} ${photoCount === 1 ? g.photo : g.photos}`;
  const videoPart = `${videoCount} ${videoCount === 1 ? g.video : g.videos}`;
  const total = photoCount + videoCount;
  const counts =
    total === 0 ? null : videoCount === 0 ? photoPart : photoCount === 0 ? videoPart : `${photoPart} · ${videoPart}`;

  const pieces = [description, date, location, counts].filter((p): p is string => !!p && p.length > 0);
  if (pieces.length === 0) return null;

  return (
    <p className="mt-2 text-sm sm:text-base text-fg drop-shadow max-w-2xl break-words">
      {pieces.join(" · ")}
    </p>
  );
}
