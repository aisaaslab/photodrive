"use client";

import { useId, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn, focusRing } from "@/lib/ui/cn";

export type AccordionItem = { id: string; question: React.ReactNode; answer: React.ReactNode };

/**
 * Disclosure list (FAQ). Each question is a real button with `aria-expanded` and `aria-controls`; its answer is a labelled region.
 * Closed answers stay in the HTML (hidden by a grid-row transition, not removed) so search engines and the FAQ structured data match
 * what visitors can read. `defaultOpen` lists the ids open at first; several can be open at once.
 */
export function Accordion({ items, defaultOpen = [], className }: { items: AccordionItem[]; defaultOpen?: string[]; className?: string }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultOpen));
  const base = useId();
  const toggle = (id: string) => setOpen((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return (
    <ul className={cn("flex flex-col gap-3.5", className)}>
      {items.map((item) => {
        const isOpen = open.has(item.id);
        const btnId = `${base}-${item.id}-q`;
        const panelId = `${base}-${item.id}-a`;
        return (
          <li key={item.id} className={cn("rounded-card border bg-surface transition-colors", isOpen ? "border-accent/50" : "border-line")}>
            <h3>
              <button
                type="button" id={btnId} aria-expanded={isOpen} aria-controls={panelId} onClick={() => toggle(item.id)}
                className={cn("flex w-full items-center justify-between gap-6 rounded-card px-7 py-6 text-left text-lg font-bold text-fg", focusRing)}
              >
                <span>{item.question}</span>
                {isOpen ? <Minus aria-hidden className="size-5 shrink-0 text-accent" /> : <Plus aria-hidden className="size-5 shrink-0 text-fg-muted" />}
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={btnId} className={cn("grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <div className="overflow-hidden"><div className="px-7 pb-6 text-[16px] leading-relaxed text-fg-soft">{item.answer}</div></div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
