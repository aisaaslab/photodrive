"use client";

import { useLanguage } from "@/lib/i18n";

/**
 * Footer credit lines, rendered in the visitor's chosen language:
 * "Photographed by {name}" and "Powered by {APP_NAME}" (the brand name itself
 * isn't translated).
 */
export function FooterCredit({ photographerName }: { photographerName: string }) {
  const { t } = useLanguage();
  return (
    <p className="text-xs text-stone-600">
      {t.gallery.photographedBy} {photographerName}
    </p>
  );
}

export function PoweredBy({ appName }: { appName: string }) {
  const { t } = useLanguage();
  return (
    <p className="text-xs text-stone-500">
      {t.gallery.poweredBy} {appName}
    </p>
  );
}
