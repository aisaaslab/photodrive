import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn, focusRing } from "@/lib/ui/cn";

export type ButtonVariant = "primary" | "glass" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-canvas hover:brightness-110 active:brightness-95",
  glass: "bg-scrim text-fg border border-white/15 backdrop-blur hover:bg-glass active:bg-glass/60",
  outline: "bg-surface-2 text-fg border border-line hover:border-accent/60 active:bg-surface",
  ghost: "text-fg-soft hover:text-fg hover:bg-glass active:bg-glass/60",
  danger: "bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-sm gap-1.5",
  md: "h-11 px-6 text-[15px] gap-2",
  lg: "h-14 px-8 text-base gap-2.5",
};

type Common = { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; iconRight?: React.ReactNode; iconLeft?: React.ReactNode; className?: string; children: React.ReactNode };
type AsButton = Common & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof Common> & { href?: undefined };
type AsLink = Common & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof Common> & { href: string };

/** The one button of the app. Pass `href` to render a link with the same look. Pill-shaped, weight 700, label colour is canvas on accent. */
export function Button(props: AsButton | AsLink) {
  const { variant = "primary", size = "md", loading, iconLeft, iconRight, className, children, ...rest } = props;
  const classes = cn(
    "inline-flex items-center justify-center rounded-pill font-bold whitespace-nowrap select-none transition-[filter,background-color,border-color,color] duration-150",
    "disabled:opacity-50 disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:pointer-events-none",
    focusRing, variants[variant], sizes[size], className,
  );
  const content = (
    <>
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : iconLeft}
      {children}
      {!loading && iconRight}
    </>
  );
  if ("href" in props && props.href !== undefined) {
    const { href, ...a } = rest as Omit<AsLink, keyof Common>;
    return <Link href={href} className={classes} {...a}>{content}</Link>;
  }
  const b = rest as Omit<AsButton, keyof Common>;
  return <button type="button" className={classes} {...b} disabled={b.disabled || loading} aria-busy={loading || undefined}>{content}</button>;
}
