"use client";

import { Modal } from "@/components/ui/Modal";
import { useLanguage } from "@/lib/i18n";
import type { GalleryDoc } from "@/lib/firestore/types";

/** "Delete gallery?": names the gallery, says the photos in Drive stay untouched, and asks for confirmation. */
export function DeleteGalleryModal({
  gallery, deleting, onCancel, onConfirm,
}: {
  gallery: GalleryDoc;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLanguage();
  const c = t.galleryCard;
  return (
    <Modal
      onClose={() => { if (!deleting) onCancel(); }}
      ariaLabel={c.deleteTitle}
      dismissOnBackdrop={false}
      className="bg-[#111111] border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full p-6"
    >
        <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h3 className="font-semibold text-white text-center mb-1.5">{c.deleteTitle}</h3>
        <p className="text-sm text-white/70 text-center mb-6 leading-relaxed">
          {c.deleteBody1}{" "}
          <span className="font-medium text-stone-200">&ldquo;{gallery.name}&rdquo;</span>{" "}
          {c.deleteBody2}
        </p>
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 border border-white/10 text-stone-300 rounded-xl py-2.5 text-sm font-medium hover:bg-white/[0.06] transition-colors disabled:opacity-50"
          >
            {c.cancel}
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 bg-red-500 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {deleting
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : c.delete
            }
          </button>
        </div>
  </Modal>
  );
}
