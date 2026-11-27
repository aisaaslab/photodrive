import { cn } from "@/lib/ui/cn";

type Tone = "default" | "raised" | "highlight";
const tones: Record<Tone, string> = {
  default: "bg-surface border border-line",
  raised: "bg-surface-2 border border-line",
  highlight: "bg-surface-2 border-2 border-accent shadow-glow",
};

/** A container with the design's card look. `hoverable` adds the lift-and-glow border used by feature cards. */
export function Card({ tone = "default", hoverable, as: Tag = "div", className, children }: {
  tone?: Tone; hoverable?: boolean; as?: "div" | "li" | "article" | "section"; className?: string; children: React.ReactNode;
}) {
  return (
    <Tag className={cn("rounded-card p-8", tones[tone], hoverable && "transition-colors duration-200 hover:border-accent/50", className)}>
      {children}
    </Tag>
  );
}
