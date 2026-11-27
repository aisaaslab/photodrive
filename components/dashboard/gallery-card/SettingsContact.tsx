"use client";

import { useLanguage } from "@/lib/i18n";
import type { GalleryDoc } from "@/lib/firestore/types";
import { sectionHeading, SOCIAL_FIELDS } from "./settingsShared";
import type { GallerySettingsForm } from "./types";

/** Settings: the booking button and the website / Instagram / Facebook links. */
export function SettingsContact({ gallery, form }: { gallery: GalleryDoc; form: GallerySettingsForm }) {
  const { t } = useLanguage();
  const c = t.galleryCard;
  const { values, set } = form;
  return (
    <section className="space-y-3">
      <h4 className={sectionHeading}>{c.sectionContact}</h4>
      {/* "Book this photographer" CTA — a link + on/off toggle.
          Accepts any URL: mailto:, https://wa.me/, https://m.me/,
          a booking page, etc. Quick-fill chips for common types. */}
      <div className="bg-surface-2 border border-line rounded-lg p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span id={`book-${gallery.id}`} className="text-xs font-medium text-fg-soft">{c.bookCtaLabel}</span>
          <button
            type="button"
            role="switch"
            aria-checked={values.bookEnabled}
            aria-labelledby={`book-${gallery.id}`}
            onClick={() => set("bookEnabled", !values.bookEnabled)}
            className={`relative w-9 h-5 rounded-full transition-colors ${values.bookEnabled ? "bg-accent-deep" : "bg-surface-2"}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${values.bookEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>
        {values.bookEnabled && (
          <>
            <input
              type="text"
              value={values.bookLink}
              onChange={(e) => set("bookLink", e.target.value)}
              placeholder={c.bookLinkPlaceholder}
              aria-label={c.bookCtaLabel}
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-fg outline-none focus:border-fg-muted/30 transition-all placeholder:text-fg-muted"
            />
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "Email", prefix: "mailto:" },
                { label: "WhatsApp", prefix: "https://wa.me/" },
                { label: "Messenger", prefix: "https://m.me/" },
                { label: "Website", prefix: "https://" },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => set("bookLink", chip.prefix)}
                  className="text-[10px] font-medium text-fg-muted bg-surface-2 border border-line rounded-full px-2.5 py-1 hover:text-fg hover:border-fg-muted/30 transition-all"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-fg-soft mb-1">{c.linksLabel}</p>
        <div className="space-y-2">
          {SOCIAL_FIELDS.map((soc) => (
            <div key={soc.key} className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted">{soc.icon}</span>
              <input
                type="url"
                value={values.social[soc.key]}
                onChange={(e) => set("social", { ...values.social, [soc.key]: e.target.value } as typeof values.social)}
                placeholder={soc.placeholder}
                aria-label={soc.key}
                className="w-full bg-surface-2 border border-line rounded-lg pl-9 pr-3 py-2 text-sm text-fg outline-none focus:border-fg-muted/30 transition-all placeholder:text-fg-muted"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
