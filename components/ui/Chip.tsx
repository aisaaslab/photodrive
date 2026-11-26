import { cn, focusRing } from "@/lib/ui/cn";

/** A rounded label with a leading dot ("Weddings", "Portraits"); becomes a toggle button when `onClick` is given. */
export function Chip({ children, dot = true, active, onClick, className }: {
  children: React.ReactNode; dot?: boolean; active?: boolean; onClick?: () => void; className?: string;
}) {
  const classes = cn(
    "inline-flex items-center gap-2.5 rounded-pill border px-5 py-2 text-[15px] font-semibold transition-colors",
    active ? "border-accent bg-accent-soft text-fg" : "border-line bg-surface-2 text-fg-soft",
    onClick && cn("hover:border-accent/60 hover:text-fg cursor-pointer", focusRing),
    className,
  );
  const inner = <>{dot && <span aria-hidden className="size-1.5 rounded-full bg-accent" />}{children}</>;
  return onClick
    ? <button type="button" aria-pressed={active} onClick={onClick} className={classes}>{inner}</button>
    : <span className={classes}>{inner}</span>;
}
