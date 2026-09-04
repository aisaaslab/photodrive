"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

const TABS = [
  { href: "/dashboard/admin", label: "Overview" },
  { href: "/dashboard/admin/users", label: "Users" },
  { href: "/dashboard/admin/plans", label: "Plans" },
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

  if (loading || checking) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (!allowed) return null;

  return (
    <div>
      {/* Back-office sub-nav */}
      <div className="flex items-center justify-between gap-3 mb-8">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold tracking-widest uppercase text-[#2dabe0] border border-[#17509e]/30 bg-[#17509e]/10 rounded-md px-2 py-1 mr-1.5">
            Admin
          </span>
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-white text-stone-900"
                    : "text-stone-400 hover:text-white hover:bg-white/[0.06]"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
        <Link
          href="/dashboard"
          className="text-xs text-white/50 hover:text-white transition-colors shrink-0"
        >
          ← Dashboard
        </Link>
      </div>
      {children}
    </div>
  );
}
