"use client";

import { useLanguage } from "@/lib/i18n";
import type { GalleryDoc } from "@/lib/firestore/types";
import { TITLE_COLORS, titleFontFamily } from "@/lib/gallery/title-style";
import { sectionHeading, PREVIEW_SIZES, titleFontLabel, titleSizeLabel } from "./settingsShared";
import { driveFileThumbUrl } from "@/lib/drive/public-url";
import { coverObjectPosition } from "@/lib/gallery/cover-position";
import type { GallerySettingsForm } from "./types";

/** Settings: cover and title style with a live preview, and showing the photographer's name in the gallery header. */
export function SettingsAppearance({ gallery, form, onChooseCover }: { gallery: GalleryDoc; form: GallerySettingsForm; onChooseCover: () => void }) {
  const { t } = useLanguage();
  const c = t.galleryCard;
  const { values, set } = form;
  return (
    <section className="space-y-3">
      <h4 className={sectionHeading}>{c.sectionAppearance}</h4>

      {/* Live preview: the banner as clients see it, using the real
          cover + position and the title font / color / size being
          edited. */}
      <div>
        <p className="text-[11px] font-medium text-fg-muted mb-1.5">{c.titlePreview}</p>
        <div className="relative h-28 rounded-xl overflow-hidden border border-line bg-gradient-to-br from-[#17509e] via-[#0d2d5c] to-stone-900">
          {gallery.coverFileId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={driveFileThumbUrl(gallery.coverFileId, 800)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: coverObjectPosition(gallery.coverPosX, gallery.coverPosY) }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
          <div className="absolute inset-x-0 bottom-0 px-4 pb-3 text-center">
            <p
              className="font-bold leading-tight drop-shadow-lg truncate"
              style={{
                fontFamily: titleFontFamily(values.titleFont),
                color: values.titleColor,
                fontSize: PREVIEW_SIZES[values.titleSize] ?? PREVIEW_SIZES.md,
              }}
            >
              {values.name || gallery.name}
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onChooseCover()}
        className="w-full flex items-center justify-center gap-1.5 bg-surface border border-line rounded-lg px-3 py-2 text-xs text-fg-soft hover:text-fg hover:border-fg-muted/30 transition-all"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25z" />
        </svg>
        {gallery.coverFileId ? c.coverCurrent : c.chooseCover}
      </button>

      <div className="bg-surface-2 border border-line rounded-lg p-3 space-y-3">
        <p className="text-xs font-medium text-fg-soft">{c.titleFontLabel}</p>
        <div className="grid grid-cols-5 gap-1.5">
          {(["classic", "serif", "script", "modern", "mono"] as const).map((fid) => (
            <button
              key={fid}
              type="button"
              aria-pressed={values.titleFont === fid}
              onClick={() => set("titleFont", fid)}
              className={`flex flex-col items-center gap-1 rounded-lg border py-2 px-1 transition-all ${
                values.titleFont === fid ? "border-accent bg-accent/10" : "border-line hover:border-fg-muted/30"
              }`}
            >
              <span className="text-fg text-lg leading-none" style={{ fontFamily: titleFontFamily(fid) }}>Aa</span>
              <span className="text-[9px] text-fg-muted">{titleFontLabel(fid, c)}</span>
            </button>
          ))}
        </div>

        <p className="text-xs font-medium text-fg-soft">{c.titleColorLabel}</p>
        <div className="flex flex-wrap gap-2">
          {TITLE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={color}
              aria-label={color}
              aria-pressed={values.titleColor === color}
              onClick={() => set("titleColor", color)}
              className={`w-7 h-7 rounded-full border-2 transition-all ${
                values.titleColor === color ? "border-accent ring-2 ring-accent/30 scale-110" : "border-fg-muted/30 hover:border-white/50"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>

        <p className="text-xs font-medium text-fg-soft">{c.titleSizeLabel}</p>
        <div className="grid grid-cols-4 gap-1.5">
          {(["sm", "md", "lg", "xl"] as const).map((sid, i) => (
            <button
              key={sid}
              type="button"
              aria-pressed={values.titleSize === sid}
              onClick={() => set("titleSize", sid)}
              className={`flex flex-col items-center gap-1 rounded-lg border py-2 px-1 transition-all ${
                values.titleSize === sid ? "border-accent bg-accent/10" : "border-line hover:border-fg-muted/30"
              }`}
            >
              <span className="text-fg leading-none" style={{ fontSize: `${0.8 + i * 0.25}rem` }}>Aa</span>
              <span className="text-[9px] text-fg-muted">{titleSizeLabel(sid, c)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Header branding: swap the PhotoDrive logo at the top of the
          public gallery for the photographer's own avatar + name. */}
      <div className="flex items-start justify-between gap-3 bg-surface border border-line rounded-lg px-3 py-2.5">
        <span>
          <span id={`brand-${gallery.id}`} className="block text-xs font-medium text-fg-soft">{c.headerBrandingLabel}</span>
          <span className="block text-[11px] text-fg-muted mt-0.5">{c.headerBrandingHint}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={values.headerBranding}
          aria-labelledby={`brand-${gallery.id}`}
          onClick={() => set("headerBranding", !values.headerBranding)}
          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5 ${values.headerBranding ? "bg-accent-deep" : "bg-surface-2"}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${values.headerBranding ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </div>
    </section>
  );
}
