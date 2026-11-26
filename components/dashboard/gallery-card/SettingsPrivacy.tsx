"use client";

import { useLanguage } from "@/lib/i18n";
import type { GalleryDoc } from "@/lib/firestore/types";
import { isPrivate } from "@/lib/gallery/visibility";
import { inputCls, sectionHeading } from "./settingsShared";
import type { GallerySettingsForm } from "./types";

/** Settings: public or private (with the password and the make-public confirmation) and whether visitors may download. */
export function SettingsPrivacy({ gallery, form }: { gallery: GalleryDoc; form: GallerySettingsForm }) {
  const { t } = useLanguage();
  const c = t.galleryCard;
  const { values, set } = form;
  return (
    <section className="space-y-3">
      <h4 className={sectionHeading}>{c.sectionPrivacy}</h4>
      <div>
        <div className="text-xs font-medium text-white/70 mb-1.5">{c.visibilityLabel}</div>
        <div role="radiogroup" aria-label={c.visibilityLabel} className="grid grid-cols-2 gap-2">
          {(["public", "private"] as const).map((v) => {
            const on = values.visibility === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  set("visibility", v);
                  set("confirmMakePublic", false);
                  form.setError("");
                }}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${on ? "border-white/60 bg-white/[0.08] text-white" : "border-white/10 text-white/60 hover:border-white/25"}`}
              >
                {v === "public" ? c.visibilityPublic : c.visibilityPrivate}
              </button>
            );
          })}
        </div>
      </div>
      {values.visibility === "private" && (
        <div>
          <label htmlFor={`pw-${gallery.id}`} className="text-xs font-medium text-white/70 mb-1 block">
            {isPrivate(gallery) ? c.newPasswordLabel : c.passwordRequiredLabel}
          </label>
          <input
            id={`pw-${gallery.id}`}
            type="text"
            maxLength={200}
            value={values.password}
            onChange={(e) => set("password", e.target.value)}
            placeholder={gallery.password ?? ""}
            className={inputCls}
          />
        </div>
      )}
      {values.visibility === "public" && isPrivate(gallery) && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 space-y-2">
          <p className="text-xs text-amber-200/90 leading-relaxed">{c.makePublicWarning}</p>
          <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
            <input
              type="checkbox"
              checked={values.confirmMakePublic}
              onChange={(e) => set("confirmMakePublic", e.target.checked)}
              className="rounded border-white/20"
            />
            {c.makePublicConfirm}
          </label>
        </div>
      )}
      <label className="flex items-start gap-2.5 cursor-pointer bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5">
        <input
          type="checkbox"
          checked={values.allowDownload}
          onChange={(e) => set("allowDownload", e.target.checked)}
          className="mt-0.5 rounded border-white/20"
        />
        <span>
          <span className="block text-xs font-medium text-white/80">{c.allowDownloadLabel}</span>
          <span className="block text-[11px] text-white/40 mt-0.5">{c.allowDownloadHint}</span>
        </span>
      </label>
    </section>
  );
}
