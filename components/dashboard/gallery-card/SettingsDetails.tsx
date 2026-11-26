"use client";

import { useLanguage } from "@/lib/i18n";
import type { GalleryDoc } from "@/lib/firestore/types";
import { inputCls, sectionHeading } from "./settingsShared";
import type { GallerySettingsForm } from "./types";

/** Settings: name, description, event date, location and the Drive folder (read-only). */
export function SettingsDetails({ gallery, form }: { gallery: GalleryDoc; form: GallerySettingsForm }) {
  const { t } = useLanguage();
  const c = t.galleryCard;
  const { values, set } = form;
  return (
    <section className="space-y-3">
      <h4 className={sectionHeading}>{c.sectionDetails}</h4>
      <div>
        <label htmlFor={`name-${gallery.id}`} className="text-xs font-medium text-fg-soft mb-1 block">{c.nameLabel}</label>
        <input id={`name-${gallery.id}`} value={values.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
      </div>
      <div>
        <label htmlFor={`desc-${gallery.id}`} className="text-xs font-medium text-fg-soft mb-1 block">{c.descriptionLabel}</label>
        <textarea
          id={`desc-${gallery.id}`}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
          placeholder={t.newGalleryForm.descriptionPlaceholder}
          className={`${inputCls} resize-none`}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`date-${gallery.id}`} className="text-xs font-medium text-fg-soft mb-1 block">{c.eventDateLabel}</label>
          <input id={`date-${gallery.id}`} type="date" value={values.eventDate} onChange={(e) => set("eventDate", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor={`loc-${gallery.id}`} className="text-xs font-medium text-fg-soft mb-1 block">{c.locationLabel}</label>
          <input id={`loc-${gallery.id}`} type="text" value={values.location} onChange={(e) => set("location", e.target.value)} placeholder={t.newGalleryForm.locationPlaceholder} className={inputCls} />
        </div>
      </div>
      <div>
        <label htmlFor={`drive-${gallery.id}`} className="text-xs font-medium text-fg-muted mb-1 block">{c.driveFolderLabel}</label>
        <div className="relative group/drive">
          <input
            id={`drive-${gallery.id}`}
            value={values.driveUrl}
            readOnly
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-fg-muted outline-none cursor-not-allowed pr-8"
          />
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <div className="absolute left-0 -top-8 hidden group-hover/drive:flex bg-surface-2 border border-line text-fg-soft text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg z-10">
            {c.driveTooltip}
          </div>
        </div>
      </div>
    </section>
  );
}
