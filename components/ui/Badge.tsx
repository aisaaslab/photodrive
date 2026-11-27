import { cn } from "@/lib/ui/cn";

type Tone = "accent" | "neutral" | "success" | "danger";
const tones: Record<Tone, string> = {
  accent: "bg-accent text-canvas",
  neutral: "bg-glass text-fg-soft",
  success: "bg-success-bright/15 text-success-bright",
  danger: "bg-danger/15 text-danger",
};

/** A tiny status label ("Most popular", "Save 31%", "New"). */
export function Badge({ tone = "accent", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-pill px-3 py-1 text-xs font-bold", tones[tone], className)}>{children}</span>;
}
