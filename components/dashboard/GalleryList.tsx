"use client";

import { GalleryDoc } from "@/lib/firestore/types";
import { GalleryCard } from "./GalleryCard";
import { useLanguage } from "@/lib/i18n";

interface Props {
  galleries: GalleryDoc[];
  /** Opens the new-gallery form; shown as the main button of the empty state. */
  onCreate?: () => void;
  onDelete: (id: string) => void | boolean | Promise<void | boolean>;
  onUpdate: (updated: GalleryDoc) => void;
}

export function GalleryList({ galleries, onCreate, onDelete, onUpdate }: Props) {
  const { t } = useLanguage();

  if (galleries.length === 0) {
    // First visit: say what to do next, in three steps, with the button right there (reuses the landing page's wording).
    const steps = [
      { title: t.how.step1Title, text: t.landing.how.step1 },
      { title: t.how.step2Title, text: t.landing.how.step2 },
      { title: t.how.step3Title, text: t.landing.how.step3 },
    ];
    return (
      <section className="animate-fade-up rounded-card border border-line bg-surface px-5 py-10 text-center sm:px-10 sm:py-14" aria-labelledby="empty-title">
        <h3 id="empty-title" className="text-xl font-extrabold text-fg">{t.galleryList.emptyTitle}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">{t.how.subtitle}</p>
        <ol className="mx-auto mt-8 grid max-w-3xl gap-4 text-left sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-tile border border-line bg-surface-2 p-4">
              <span aria-hidden className="grid size-8 place-items-center rounded-full bg-accent-soft text-xs font-extrabold text-accent">{i + 1}</span>
              <p className="mt-3 text-sm font-bold text-fg">{s.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-fg-muted">{s.text}</p>
            </li>
          ))}
        </ol>
        {onCreate && (
          <button type="button" onClick={onCreate} className="mt-8 inline-flex h-12 items-center gap-2 rounded-pill bg-accent px-7 text-sm font-bold text-canvas shadow-[0_10px_20px_rgba(46,171,224,0.3)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            {t.dashboard.newGallery}
          </button>
        )}
      </section>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
      {galleries.map((g) => (
        <GalleryCard key={g.id} gallery={g} onDelete={onDelete} onUpdate={onUpdate} />
      ))}
    </div>
  );
}
