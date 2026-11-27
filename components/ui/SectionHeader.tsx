import { cn } from "@/lib/ui/cn";
import { Pill } from "./Pill";

/** Eyebrow, headline and optional lead paragraph. `compact` is the smaller headline used beside a visual; `align` centres or left-aligns. */
export function SectionHeader({ eyebrow, title, lead, compact, align = "center", as: Tag = "h2", className }: {
  eyebrow?: React.ReactNode; title: React.ReactNode; lead?: React.ReactNode; compact?: boolean; align?: "center" | "left"; as?: "h1" | "h2" | "h3"; className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-5", align === "center" ? "items-center text-center" : "items-start text-left", className)}>
      {eyebrow && <Pill>{eyebrow}</Pill>}
      <Tag className={cn("font-extrabold text-fg text-balance", compact ? "text-h2-compact max-w-[15ch]" : "text-h2 max-w-[900px]")}>{title}</Tag>
      {lead && <p className="text-lead max-w-[36rem] text-fg-muted text-pretty">{lead}</p>}
    </header>
  );
}
