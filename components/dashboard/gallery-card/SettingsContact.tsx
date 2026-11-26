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
      <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span id={`book-${gallery.id}`} className="text-xs font-medium text-white/80">{c.bookCtaLabel}</span>
          <button
            type="button"
            role="switch"
            aria-checked={values.bookEnabled}
            aria-labelledby={`book-${gallery.id}`}
            onClick={() => set("bookEnabled", !values.bookEnabled)}
            className={`relative w-9 h-5 rounded-full transition-colors ${values.bookEnabled ? "bg-[#17509e]" : "bg-white/10"}`}
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
              className="w-full bg-[#111111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/25 transition-all placeholder-stone-600"
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
                  className="text-[10px] font-medium text-white/60 bg-white/[0.06] border border-white/10 rounded-full px-2.5 py-1 hover:text-white hover:border-white/20 transition-all"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-white/70 mb-1">{c.linksLabel}</p>
        <div className="space-y-2">
          {SOCIAL_FIELDS.map((soc) => (
            <div key={soc.key} className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40">{soc.icon}</span>
              <input
                type="url"
                value={values.social[soc.key]}
                onChange={(e) => set("social", { ...values.social, [soc.key]: e.target.value } as typeof values.social)}
                placeholder={soc.placeholder}
                aria-label={soc.key}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-white/25 transition-all placeholder-stone-600"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
