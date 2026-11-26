"use client";

import { Modal } from "@/components/ui/Modal";
import { LOCALES, useLanguage } from "@/lib/i18n";
import type { GalleryDoc } from "@/lib/firestore/types";
import type { useGallerySelections } from "./useGallerySelections";

/** The client's favourites for a gallery: who sent them and when, any note, the list, "Copy list" and "Download files (.zip)". */
export function GallerySelectionsModal({
  gallery, selections, onClose,
}: {
  gallery: GalleryDoc;
  selections: ReturnType<typeof useGallerySelections>;
  onClose: () => void;
}) {
  const { t, lang } = useLanguage();
  const c = t.galleryCard;
  const { selLoading, selPhotos, selError, selSubmission, selCopied, selZipping, copySelectionList, downloadSelectionFiles } = selections;

  return (
    <Modal
      onClose={onClose}
      ariaLabel={c.selectionsTitle}
      className="bg-[#111111] border border-white/10 rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col"
    >
        <div className="flex items-start justify-between p-5 border-b border-white/[0.08]">
          <div>
            <h3 className="font-semibold text-white flex items-center gap-2">
              <svg className="w-4 h-4 text-[#2dabe0]" viewBox="0 0 24 24" fill="currentColor"><path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
              {c.selectionsTitle}
            </h3>
            <p className="text-xs text-white/50 mt-0.5 truncate max-w-[18rem]">{gallery.name}</p>
          </div>
          <button onClick={() => onClose()} aria-label={c.cancel} className="text-white/50 hover:text-white transition-colors shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* The client's explicit "Send selection": who, when, and any note. */}
          {selSubmission && !selLoading && !selError && (
            <div className="mb-4 rounded-xl border border-[#2dabe0]/30 bg-[#2dabe0]/[0.08] p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2dabe0]">{c.selectionSent}</p>
              <p className="text-sm text-white mt-1">
                <span className="text-white/60">{c.sentBy}</span>{" "}
                <span className="font-semibold">{selSubmission.name}</span>
              </p>
              <p className="text-xs text-white/50 mt-0.5">
                {new Date(selSubmission.submittedAt).toLocaleString(LOCALES[lang], { dateStyle: "medium", timeStyle: "short" })}
                {selSubmission.email && (
                  <> · <a href={`mailto:${selSubmission.email}`} className="underline underline-offset-2 hover:text-white">{selSubmission.email}</a></>
                )}
              </p>
              {selSubmission.note && (
                <p className="mt-2 text-sm text-white/80 border-l-2 border-white/20 pl-3 whitespace-pre-wrap break-words">
                  <span className="sr-only">{c.clientNote}: </span>{selSubmission.note}
                </p>
              )}
            </div>
          )}
          {selLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          ) : selError ? (
            <p className="text-sm text-white/50 text-center py-10">{c.error}</p>
          ) : selPhotos.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-white/70">{c.noSelections}</p>
              <p className="text-xs text-white/40 mt-1">{c.noSelectionsHint}</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-white/50 mb-3">
                <span className="text-[#2dabe0] font-semibold">{selPhotos.length}</span> {c.photosSelected}
              </p>
              <ul className="space-y-1">
                {selPhotos.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-sm text-white/80 bg-white/[0.03] rounded-lg px-3 py-2">
                    <svg className="w-3.5 h-3.5 text-[#2dabe0] shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
                    <span className="truncate">{p.name}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {!selLoading && !selError && selPhotos.length > 0 && (
          <div className="p-4 border-t border-white/[0.08] flex gap-2">
            <button
              onClick={copySelectionList}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium transition-all border ${
                selCopied ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "border-white/10 text-white/80 hover:bg-white/[0.06]"
              }`}
            >
              {selCopied ? (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>{c.copied}</>
              ) : (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>{c.copyList}</>
              )}
            </button>
            <button
              onClick={downloadSelectionFiles}
              disabled={selZipping}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold bg-white text-stone-900 hover:bg-stone-100 transition-all disabled:opacity-60"
            >
              {selZipping ? (
                <><div className="w-4 h-4 border-2 border-stone-400 border-t-stone-900 rounded-full animate-spin" />{c.preparing}</>
              ) : (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>{c.downloadFiles}</>
              )}
            </button>
          </div>
        )}
  </Modal>
  );
}
