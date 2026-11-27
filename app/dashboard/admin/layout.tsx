"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAttention } from "@/components/admin/useAttention";

const TABS: { href: string; label: string; badge?: "payments" | "support" }[] = [
  { href: "/dashboard/admin", label: "Overview" },
  { href: "/dashboard/admin/users", label: "Users" },
  { href: "/dashboard/admin/galleries", label: "Galleries" },
  { href: "/dashboard/admin/payments", label: "Payments", badge: "payments" },
  { href: "/dashboard/admin/support", label: "Support", badge: "support" },
  { href: "/dashboard/admin/plans", label: "Plans" },
  { href: "/dashboard/admin/promo-codes", label: "Promo codes" },
  { href: "/dashboard/admin/settings", label: "Settings" },
];

/**
 * Back-office shell. This layout nests inside the dashboard layout, so the
 * admin area intentionally renders NO header of its own — it inherits the
 * primary dashboard header, footer, and page width, and only adds the
 * back-office tab sub-nav on top of the page content.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const attention = useAttention();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }

    // Verify admin server-side
    user.getIdToken().then((token) =>
      fetch("/api/admin/session", { headers: { Authorization: `Bearer ${token}` } })
    ).then((res) => {
      if (res.ok) { setAllowed(true); setChecking(false); }
      else { router.replace("/dashboard"); }
    }).catch(() => router.replace("/dashboard"));
  }, [user, loading, router]);

  // On a phone the tabs scroll sideways: bring the current one into view.
  useEffect(() => {
    if (!allowed) return;
    document.querySelector('[aria-label="Back office sections"] [aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname, allowed]);

  if (loading || checking) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-5 h-5 border-2 border-line border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (!allowed) return null;

  return (
    <div>
      {/* Back-office sub-nav */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-8">
        <div className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto pb-1" aria-label="Back office sections" role="navigation">
          <span className="text-[10px] font-semibold tracking-widest uppercase text-accent border border-accent-deep/30 bg-accent-deep/10 rounded-md px-2 py-1 mr-1 shrink-0">
            Admin
          </span>
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-pill text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent text-canvas"
                    : "text-fg-muted hover:text-fg hover:bg-surface-2"
                }`}
              >
                {tab.label}
                {(() => {
                  const n = tab.badge === "payments" ? attention?.payments : tab.badge === "support" ? attention?.supportUnread : 0;
                  return n ? (
                    <span className={`relative ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${active ? "bg-canvas text-accent" : "bg-amber-500/20 text-amber-300"}`}>
                      {n > 99 ? "99+" : n}
                      <span className="sr-only"> {tab.badge === "payments" ? "to review" : "unread"}</span>
                    </span>
                  ) : null;
                })()}
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-fg-muted hover:text-fg transition-colors"
            title="Open the site in a new tab"
          >
            View site ↗
          </a>
          <a
            href="/#pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-fg-muted hover:text-fg transition-colors"
            title="Open the pricing section in a new tab to check your changes"
          >
            Pricing ↗
          </a>
          <span className="w-px h-3 bg-surface-2" />
          <Link
            href="/dashboard"
            className="text-xs text-fg-muted hover:text-fg transition-colors shrink-0"
          >
            ← Dashboard
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}
