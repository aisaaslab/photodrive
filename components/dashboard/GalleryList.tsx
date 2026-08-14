"use client";

import { GalleryDoc } from "@/lib/firestore/types";
import { GalleryCard } from "./GalleryCard";
import { useLanguage } from "@/lib/i18n";

interface Props {
  galleries: GalleryDoc[];
  onDelete: (id: string) => void;
  onUpdate: (updated: GalleryDoc) => void;
}

export function GalleryList({ galleries, onDelete, onUpdate }: Props) {
  const { t } = useLanguage();

  if (galleries.length === 0) {
    return (
      <div className="text-center py-24 animate-fade-up">
        <div className="w-14 h-14 bg-white/[0.05] rounded-2xl flex items-center justify-center mx-auto mb-5 border border-white/10">
          <svg className="w-7 h-7 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        </div>
        <h3 className="font-semibold text-white mb-1.5" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {t.galleryList.emptyTitle}
        </h3>
        <p className="text-sm text-stone-400">
          {t.galleryList.emptySubtitle}
        </p>
      </div>
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
