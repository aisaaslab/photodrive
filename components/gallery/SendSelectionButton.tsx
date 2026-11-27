"use client";

import { useLanguage } from "@/lib/i18n";

/**
 * "Send selection": appears as soon as the client has favorites, on any tab, so the hand-off to the photographer is always one tap away.
 */
export function SendSelectionButton({ count, onClick }: { count: number; onClick: () => void }) {
  const { t } = useLanguage();
  return (
    <div data-ui="send-selection-bar" className="fixed bottom-4 inset-x-0 z-30 flex justify-center pointer-events-none px-4">
      <button
        onClick={onClick}
        className="pointer-events-auto inline-flex items-center gap-2.5 bg-accent text-canvas rounded-pill pl-4 pr-5 py-3 text-sm font-semibold shadow-2xl hover:brightness-110 active:scale-[0.98] transition-all animate-fade-up"
      >
        <svg className="w-4 h-4 text-canvas" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
        </svg>
        <span>{count}</span>
        <span className="w-px h-4 bg-canvas/30" />
        {t.gallery.sendSelectionShort}
      </button>
    </div>
  );
}
