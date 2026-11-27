"use client";

import type { useNewGalleryForm } from "./useNewGalleryForm";

type Form = ReturnType<typeof useNewGalleryForm>;

/** Who can open the gallery: public (the link opens it) or private (a password is required, and its field appears). */
export function VisibilityField({ form }: { form: Form }) {
  const { f, setPassword, setVisibility } = form;
  const { password, visibility } = form.values;
  return (
    <>
      {/* Who can open this gallery: public (the link opens it) or private (a password is required) */}
      <div className="bg-surface-2 border border-line rounded-xl p-4 space-y-3">
        <div className="text-xs font-medium text-fg-soft">{f.visibilityLabel}</div>
        <div role="radiogroup" aria-label={f.visibilityLabel} className="grid grid-cols-2 gap-2">
          {(["public", "private"] as const).map((v) => {
            const on = visibility === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setVisibility(v)}
                className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${on ? "border-white/60 bg-surface-2" : "border-line hover:border-fg-muted/30"}`}
              >
                <span className="block text-sm font-medium text-fg">{v === "public" ? f.visibilityPublic : f.visibilityPrivate}</span>
                <span className="block text-xs text-fg-muted mt-0.5">{v === "public" ? f.visibilityPublicHint : f.visibilityPrivateHint}</span>
              </button>
            );
          })}
        </div>
        {visibility === "private" && (
          <div className="animate-scale-in">
            <label htmlFor="new-gallery-password" className="text-xs font-medium text-fg-soft mb-1 block">
              {f.passwordLabel}
            </label>
            <input
              id="new-gallery-password"
              type="password"
              required
              maxLength={200}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={f.passwordPlaceholder}
              className="w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-sm text-fg placeholder:text-fg-muted outline-none focus:border-fg-muted/30 transition-all"
            />
          </div>
        )}
      </div>
    </>
  );
}
