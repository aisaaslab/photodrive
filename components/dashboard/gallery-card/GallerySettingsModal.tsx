"use client";

import { Modal } from "@/components/ui/Modal";
import { useLanguage } from "@/lib/i18n";
import type { GalleryDoc } from "@/lib/firestore/types";
import { SettingsDetails } from "./SettingsDetails";
import { SettingsAppearance } from "./SettingsAppearance";
import { SettingsPrivacy } from "./SettingsPrivacy";
import { SettingsContact } from "./SettingsContact";
import type { useGallerySettings } from "./useGallerySettings";

/**
 * Gallery settings: a proper dialog instead of cramming the form into a card a third of the page wide. Grouped into sections
 * (details, appearance, privacy and downloads, contact and links), with Cancel and Save.
 */
export function GallerySettingsModal({
  gallery, settings, onChooseCover,
}: {
  gallery: GalleryDoc;
  settings: ReturnType<typeof useGallerySettings>;
  onChooseCover: () => void;
}) {
  const { t } = useLanguage();
  const c = t.galleryCard;
  const { values, saving, error } = settings;
  const onCancel = settings.cancel;
  const onSave = settings.save;

  return (
    <Modal
      onClose={() => { if (!saving) onCancel(); }}
      ariaLabel={c.settingsTitle}
      className="bg-[#111111] border border-white/10 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col"
    >
          <div className="flex items-start justify-between p-5 border-b border-white/[0.08] shrink-0">
            <div className="min-w-0">
              <h3 className="font-semibold text-white">{c.settingsTitle}</h3>
              <p className="text-xs text-white/50 mt-0.5 truncate max-w-[22rem]">{gallery.name}</p>
            </div>
            <button onClick={onCancel} disabled={saving} aria-label={c.cancel} className="text-white/50 hover:text-white transition-colors shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-7">
        <SettingsDetails gallery={gallery} form={settings} />
        <SettingsAppearance gallery={gallery} form={settings} onChooseCover={onChooseCover} />
        <SettingsPrivacy gallery={gallery} form={settings} />
        <SettingsContact gallery={gallery} form={settings} />
      </div>

          <div className="p-4 border-t border-white/[0.08] shrink-0">
            {error && <p className="text-xs text-red-400 mb-2" role="alert">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                disabled={saving}
                className="flex-1 border border-white/10 text-white/70 rounded-lg py-2.5 text-xs font-medium hover:bg-white/[0.05] transition-colors disabled:opacity-50"
              >
                {c.cancel}
              </button>
              <button
                onClick={onSave}
                disabled={saving || !values.name.trim()}
                className="flex-1 bg-white text-stone-900 rounded-lg py-2.5 text-xs font-semibold hover:bg-stone-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {saving ? <div className="w-3.5 h-3.5 border-2 border-stone-400 border-t-stone-900 rounded-full animate-spin" /> : c.save}
              </button>
            </div>
          </div>
    </Modal>
  );
}
