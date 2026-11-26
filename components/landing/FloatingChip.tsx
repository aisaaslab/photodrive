import { cn } from "@/lib/ui/cn";
import { Icon } from "./Icon";

/** A small floating card over the product preview: icon tile, bold title, muted subtitle. Positioned by the caller (`className`). */
export function FloatingChip({ icon, title, sub, className }: { icon: string; title: string; sub: string; className?: string }) {
  return (
    <div data-chip className={cn("absolute z-10 flex items-center gap-3 rounded-[18px] border border-line bg-surface-2 py-3 pl-3 pr-5 shadow-chip", className)}>
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-accent-soft"><Icon name={icon} size={18} /></span>
      <span className="flex flex-col gap-px leading-tight">
        <span className="whitespace-nowrap text-sm font-bold text-fg">{title}</span>
        <span className="whitespace-nowrap text-xs text-fg-muted">{sub}</span>
      </span>
    </div>
  );
}
