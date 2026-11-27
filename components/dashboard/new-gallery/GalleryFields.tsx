"use client";

import type { useNewGalleryForm } from "./useNewGalleryForm";
import { driveCheckView } from "@/lib/drive/check-message";

type Form = ReturnType<typeof useNewGalleryForm>;

/** Name, optional description / date / location, and the Google Drive folder link (with its inline validity hint). */
export function GalleryFields({ form }: { form: Form }) {
  const { f, driveValid, driveInvalid, driveCheck, setName, setDriveUrl, setDescription, setEventDate, setLocation } = form;
  const { name, driveUrl, description, eventDate, location } = form.values;
  return (
    <>
      {/* Gallery name */}
      <div>
        <label htmlFor="ng-name" className="block text-xs font-medium text-fg mb-1.5">
          {f.nameLabel}
        </label>
        <input id="ng-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={f.namePlaceholder}
          required
          className="w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-sm text-fg placeholder:text-fg-muted outline-none focus:border-fg-muted/30 transition-all"
        />
      </div>

      {/* Optional gallery metadata */}
      <div>
        <label htmlFor="ng-desc" className="block text-xs font-medium text-fg mb-1.5">
          {f.descriptionLabel}
        </label>
        <textarea id="ng-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={f.descriptionPlaceholder}
          rows={2}
          className="w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-sm text-fg placeholder:text-fg-muted outline-none focus:border-fg-muted/30 transition-all resize-none"
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="ng-date" className="block text-xs font-medium text-fg mb-1.5">
            {f.eventDateLabel}
          </label>
          <input id="ng-date"
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-sm text-fg placeholder:text-fg-muted outline-none focus:border-fg-muted/30 transition-all"
          />
        </div>
        <div>
          <label htmlFor="ng-location" className="block text-xs font-medium text-fg mb-1.5">
            {f.locationLabel}
          </label>
          <input id="ng-location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={f.locationPlaceholder}
            className="w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-sm text-fg placeholder:text-fg-muted outline-none focus:border-fg-muted/30 transition-all"
          />
        </div>
      </div>

      {/* Drive URL */}
      <div>
        <label htmlFor="ng-drive" className="block text-xs font-medium text-fg mb-1.5">
          {f.driveLabel}
        </label>
        <div className="relative">
          <input
            id="ng-drive"
            type="url"
            value={driveUrl}
            onChange={(e) => setDriveUrl(e.target.value)}
            placeholder={f.drivePlaceholder}
            required
            className={`w-full bg-surface-2 border rounded-xl px-4 py-2.5 pr-10 text-sm text-fg placeholder:text-fg-muted outline-none transition-all ${
              driveValid
                ? "border-emerald-500/50 focus:border-emerald-500"
                : driveInvalid
                ? "border-red-500/50 focus:border-red-500"
                : "border-line focus:border-fg-muted/30"
            }`}
          />
          {driveValid && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          )}
          {driveInvalid && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}
        </div>
        {driveCheck && (() => {
          const view = driveCheck === "checking" ? null : driveCheckView(driveCheck);
          if (driveCheck !== "checking" && !view) return null;
          const tone = view?.tone === "good" ? "text-success-bright" : view?.tone === "warn" ? "text-amber-400" : "text-fg-muted";
          const text = view ? f[view.key].replace("{n}", String(view.count ?? 0)) : f.driveChecking;
          return <p role="status" aria-live="polite" data-ui="drive-check" className={`mt-1.5 text-xs font-medium ${tone}`}>{text}</p>;
        })()}
        <div className="flex items-center gap-1.5 mt-1.5">
          <svg className="w-3 h-3 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <p className="text-xs text-fg-muted">{f.driveHint}</p>
        </div>
      </div>
    </>
  );
}
