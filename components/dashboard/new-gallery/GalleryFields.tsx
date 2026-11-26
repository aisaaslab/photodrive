"use client";

import type { useNewGalleryForm } from "./useNewGalleryForm";

type Form = ReturnType<typeof useNewGalleryForm>;

/** Name, optional description / date / location, and the Google Drive folder link (with its inline validity hint). */
export function GalleryFields({ form }: { form: Form }) {
  const { f, driveValid, driveInvalid, setName, setDriveUrl, setDescription, setEventDate, setLocation } = form;
  const { name, driveUrl, description, eventDate, location } = form.values;
  return (
    <>
      {/* Gallery name */}
      <div>
        <label className="block text-xs font-medium text-white mb-1.5">
          {f.nameLabel}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={f.namePlaceholder}
          required
          className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-stone-600 outline-none focus:border-white/25 transition-all"
        />
      </div>

      {/* Optional gallery metadata */}
      <div>
        <label className="block text-xs font-medium text-white mb-1.5">
          {f.descriptionLabel}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={f.descriptionPlaceholder}
          rows={2}
          className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-stone-600 outline-none focus:border-white/25 transition-all resize-none"
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-white mb-1.5">
            {f.eventDateLabel}
          </label>
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-stone-600 outline-none focus:border-white/25 transition-all"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-white mb-1.5">
            {f.locationLabel}
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={f.locationPlaceholder}
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-stone-600 outline-none focus:border-white/25 transition-all"
          />
        </div>
      </div>

      {/* Drive URL */}
      <div>
        <label className="block text-xs font-medium text-white mb-1.5">
          {f.driveLabel}
        </label>
        <div className="relative">
          <input
            type="url"
            value={driveUrl}
            onChange={(e) => setDriveUrl(e.target.value)}
            placeholder={f.drivePlaceholder}
            required
            className={`w-full bg-[#1a1a1a] border rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-stone-600 outline-none transition-all ${
              driveValid
                ? "border-emerald-500/50 focus:border-emerald-500"
                : driveInvalid
                ? "border-red-500/50 focus:border-red-500"
                : "border-white/10 focus:border-white/25"
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
        <div className="flex items-center gap-1.5 mt-1.5">
          <svg className="w-3 h-3 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <p className="text-xs text-white/60">{f.driveHint}</p>
        </div>
      </div>
    </>
  );
}
