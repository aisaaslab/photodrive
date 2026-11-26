"use client";

import { useLanguage } from "@/lib/i18n";

/** Selection action bar: shown in selection mode once something is selected. The count, and "download as .zip" with progress while it builds. */
export function SelectionBar({
  count, zipping, zipProgress, onDownload,
}: {
  count: number;
  zipping: boolean;
  zipProgress: number;
  onDownload: () => void;
}) {
  const { t } = useLanguage();
  const g = t.gallery;
  return (
    <div className="flex items-center justify-between mb-4 px-4 py-3 bg-stone-100 rounded-xl animate-scale-in">
      <span className="text-sm text-stone-600">
        <span className="font-semibold text-stone-900">{count}</span> {g.selected}
      </span>
      <button
        onClick={onDownload}
        disabled={zipping}
        className="flex items-center gap-1.5 bg-stone-900 text-white text-xs font-semibold rounded-lg px-3 py-1.5 hover:bg-stone-800 transition-colors disabled:opacity-60"
      >
        {zipping ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {g.preparing} {zipProgress}/{count}
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {g.download} {count} (.zip)
          </>
        )}
      </button>
    </div>
  );
}
