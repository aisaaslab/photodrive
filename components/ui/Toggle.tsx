"use client";

import { cn, focusRing } from "@/lib/ui/cn";

/** An on/off switch (`role="switch"`). Controlled: pass `checked` and `onChange`. Space and Enter toggle it, like any button. */
export function Toggle({ checked, onChange, label, disabled, className }: {
  checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean; className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-pill border transition-colors disabled:opacity-50 disabled:pointer-events-none",
        checked ? "border-accent bg-accent" : "border-line bg-surface-2",
        focusRing, className,
      )}
    >
      <span aria-hidden className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-fg shadow transition-transform duration-150 motion-reduce:transition-none", checked && "translate-x-5 bg-canvas")} />
    </button>
  );
}
