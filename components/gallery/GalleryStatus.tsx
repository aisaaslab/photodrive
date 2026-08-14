"use client";

import { useLanguage } from "@/lib/i18n";

export function GalleryStatus({ type }: { type: "driveError" | "noPhotos" }) {
  const { t } = useLanguage();
  return (
    <div className="text-center py-32">
      <p className="text-stone-400">{t.gallery[type]}</p>
    </div>
  );
}
