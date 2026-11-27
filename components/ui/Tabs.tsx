"use client";

import { useId, useRef } from "react";
import { cn, focusRing } from "@/lib/ui/cn";

export type TabItem<T extends string = string> = { id: T; label: React.ReactNode; count?: number };

/**
 * Pill tabs ("All / Favorites / Download all" style filters, billing period). A `tablist` with roving focus: the selected tab is
 * focusable, Left/Right/Home/End move between tabs. Controlled. Pass `panelId` to tie the tabs to the panel they control.
 */
export function Tabs<T extends string>({ items, value, onChange, label, panelId, className }: {
  items: TabItem<T>[]; value: T; onChange: (id: T) => void; label: string; panelId?: string; className?: string;
}) {
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (index: number) => {
    const target = items[(index + items.length) % items.length];
    onChange(target.id);
    refs.current[target.id]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cn("inline-flex gap-1 rounded-pill border border-line bg-surface-2 p-1", className)}>
      {items.map((item, i) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id} ref={(el) => { refs.current[item.id] = el; }} type="button" role="tab" id={`${base}-${item.id}`}
            aria-selected={selected} aria-controls={panelId} tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") { e.preventDefault(); move(i + 1); }
              else if (e.key === "ArrowLeft") { e.preventDefault(); move(i - 1); }
              else if (e.key === "Home") { e.preventDefault(); move(0); }
              else if (e.key === "End") { e.preventDefault(); move(items.length - 1); }
            }}
            className={cn("inline-flex h-10 items-center gap-2 rounded-pill px-5 text-[15px] font-semibold transition-colors", selected ? "bg-accent text-canvas" : "text-fg-soft hover:text-fg", focusRing)}
          >
            {item.label}
            {item.count !== undefined && <span className={cn("text-xs", selected ? "text-canvas/70" : "text-fg-muted")}>{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
