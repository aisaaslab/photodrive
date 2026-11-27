"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { cn, focusRing } from "@/lib/ui/cn";
import { useLanguage } from "@/lib/i18n";
import type { GalleryDoc } from "@/lib/firestore/types";
import { SettingsDetails } from "./SettingsDetails";
import { SettingsAppearance } from "./SettingsAppearance";
import { SettingsPrivacy } from "./SettingsPrivacy";
import { SettingsContact } from "./SettingsContact";
import type { useGallerySettings } from "./useGallerySettings";

/**
 * Gallery settings: a proper dialog instead of cramming the form into a card a third of the page wide. Grouped into sections
 * (details, appearance, privacy and downloads, contact and links), with Cancel and Save. A row of section chips under the title jumps
 * to a section and shows which one is in view, so a long form never feels long (S5-12).
 */
const SECTIONS = ["details", "appearance", "privacy", "contact"] as const;
type Section = (typeof SECTIONS)[number];

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
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Section>("details");
  const labels: Record<Section, string> = { details: c.sectionDetails, appearance: c.sectionAppearance, privacy: c.sectionPrivacy, contact: c.sectionContact };

  // The section nearest the top of the scrolling area is the current one.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const top = el.getBoundingClientRect().top;
      let current: Section = "details";
      for (const id of SECTIONS) {
        const node = el.querySelector<HTMLElement>(`[data-section="${id}"]`);
        if (node && node.getBoundingClientRect().top - top <= 48) current = id;
      }
      setActive(current);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  const jump = (id: Section) => scroller.current?.querySelector<HTMLElement>(`[data-section="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <Modal
      onClose={() => { if (!saving) onCancel(); }}
      ariaLabel={c.settingsTitle}
      className="bg-surface border border-line rounded-card shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col"
    >
          <div className="flex items-start justify-between p-5 border-b border-line shrink-0">
            <div className="min-w-0">
              <h3 className="font-semibold text-fg">{c.settingsTitle}</h3>
              <p className="text-xs text-fg-muted mt-0.5 truncate max-w-[22rem]">{gallery.name}</p>
            </div>
            <button onClick={onCancel} disabled={saving} aria-label={c.cancel} className="text-fg-muted hover:text-fg transition-colors shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

      <nav aria-label={c.settingsTitle} className="flex gap-1.5 overflow-x-auto px-5 py-2.5 border-b border-line shrink-0">
        {SECTIONS.map((id) => (
          <button
            key={id} type="button" onClick={() => jump(id)} aria-current={active === id ? "true" : undefined}
            className={cn("shrink-0 rounded-pill px-3.5 py-1.5 text-xs font-semibold transition-colors", active === id ? "bg-accent-soft text-accent" : "text-fg-muted hover:text-fg hover:bg-surface-2", focusRing)}
          >
            {labels[id]}
          </button>
        ))}
      </nav>

      <div ref={scroller} className="flex-1 overflow-y-auto p-5 space-y-7 scroll-smooth">
        <div data-section="details"><SettingsDetails gallery={gallery} form={settings} /></div>
        <div data-section="appearance"><SettingsAppearance gallery={gallery} form={settings} onChooseCover={onChooseCover} /></div>
        <div data-section="privacy"><SettingsPrivacy gallery={gallery} form={settings} /></div>
        <div data-section="contact"><SettingsContact gallery={gallery} form={settings} /></div>
      </div>

          <div className="p-4 border-t border-line shrink-0">
            {error && <p className="text-xs text-danger mb-2" role="alert">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                disabled={saving}
                className="flex-1 border border-line text-fg-soft rounded-lg py-2.5 text-xs font-medium hover:bg-surface-2 transition-colors disabled:opacity-50"
              >
                {c.cancel}
              </button>
              <button
                onClick={onSave}
                disabled={saving || !values.name.trim()}
                className="flex-1 bg-accent text-canvas rounded-pill py-2.5 text-xs font-semibold hover:brightness-110 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {saving ? <div className="w-3.5 h-3.5 border-2 border-canvas/30 border-t-canvas rounded-full animate-spin" /> : c.save}
              </button>
            </div>
          </div>
    </Modal>
  );
}
