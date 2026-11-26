import { cn } from "@/lib/ui/cn";

const sizes = { sm: "size-10 rounded-[10px] [&>svg]:size-[18px]", md: "size-12 rounded-tile [&>svg]:size-[22px]", lg: "size-14 rounded-[14px] [&>svg]:size-6" } as const;

/** A square tile holding one icon: accent icon on the accent-soft fill. Decorative, so hidden from screen readers. */
export function IconTile({ children, size = "md", className }: { children: React.ReactNode; size?: keyof typeof sizes; className?: string }) {
  return <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center bg-accent-soft text-accent", sizes[size], className)}>{children}</span>;
}
