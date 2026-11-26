"use client";

import { useEffect, useRef, useState } from "react";
import type { DriveFolder } from "@/lib/drive/types";

/**
 * Subfolder filter. Self-contained (own open state and outside-click handling)
 * so it can be rendered in both the desktop and the mobile controls row.
 */
export function FolderDropdown({
  subfolders, activeFolder, onChange, allLabel, folderLabel,
}: {
  subfolders: DriveFolder[];
  activeFolder: string | null;
  onChange: (name: string | null) => void;
  allLabel: string;
  folderLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (subfolders.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium border transition-all ${
          activeFolder
            ? "bg-accent text-canvas border-line"
            : "bg-surface-2 text-fg-muted border-line hover:text-fg-soft"
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v8.25m19.5 0A2.25 2.25 0 0119.5 16.5h-15a2.25 2.25 0 01-2.25-2.25m19.5 0v-1.5A2.25 2.25 0 0019.5 10.5h-15" />
        </svg>
        {activeFolder ?? folderLabel}
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div role="listbox" className="absolute top-full left-0 mt-1 z-40 bg-surface border border-line rounded-xl shadow-lg py-1 min-w-[160px]">
          <button
            role="option"
            aria-selected={!activeFolder}
            onClick={() => { onChange(null); setOpen(false); }}
            className={`w-full text-left px-4 py-2 text-sm transition-colors ${!activeFolder ? "text-accent font-semibold" : "text-fg-soft hover:bg-canvas"}`}
          >
            {allLabel}
          </button>
          {subfolders.map((sf) => (
            <button
              key={sf.id}
              role="option"
              aria-selected={activeFolder === sf.name}
              onClick={() => { onChange(sf.name); setOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${activeFolder === sf.name ? "text-accent font-semibold" : "text-fg-soft hover:bg-canvas"}`}
            >
              {sf.path}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
