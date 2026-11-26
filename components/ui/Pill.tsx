import { cn } from "@/lib/ui/cn";

/** The small uppercase label above a section heading (the design's "eyebrow"): accent text on an accent-soft capsule. */
export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-pill border border-accent/25 bg-accent-soft px-4 py-1.5 text-xs font-extrabold uppercase tracking-[0.12em] text-accent", className)}>
      {children}
    </span>
  );
}
