"use client";

import { useLanguage } from "@/lib/i18n";

export function GalleryStatus({ type }: { type: "driveError" | "noPhotos" }) {
  const { t } = useLanguage();
  return (
    <div className="text-center py-32">
      <p className="text-fg-muted">{t.gallery[type]}</p>
    </div>
  );
}
