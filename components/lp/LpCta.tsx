"use client";

import Link from "next/link";

type Props = {
  placement: "nav" | "hero" | "flow" | "mid" | "final";
  variant?: "primary" | "light";
  children: React.ReactNode;
  className?: string;
};

const VARIANT = "pixieset-alternative";

/** CTA that always leads to the auth page and reports the click to GTM. */
export function LpCta({ placement, variant = "primary", children, className = "" }: Props) {
  const styles =
    variant === "light"
      ? "bg-white text-[#0f2447] hover:bg-blue-50"
      : "bg-[#1d6fe8] text-white hover:bg-[#1a62cf] shadow-lg shadow-blue-600/25";
  return (
    <Link
      href="/login"
      data-cta={placement}
      onClick={() => {
        const w = window as Window & { dataLayer?: unknown[] };
        (w.dataLayer = w.dataLayer || []).push({ event: "lp_cta_click", lp_variant: VARIANT, lp_placement: placement });
      }}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-sm font-semibold transition-colors ${styles} ${className}`}
    >
      {children}
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
      </svg>
    </Link>
  );
}
