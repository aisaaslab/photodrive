"use client";

import { useLanguage } from "@/lib/i18n";

/**
 * Footer credit line: "Photographed by {name}" — rendered in the visitor's
 * chosen language. The "Powered by {APP_NAME}" line below it is not translated
 * (brand name) so it stays in the server component.
 */
export function FooterCredit({ photographerName }: { photographerName: string }) {
  const { t } = useLanguage();
  return (
    <p className="text-xs text-stone-500">
      {t.gallery.photographedBy} {photographerName}
    </p>
  );
}
