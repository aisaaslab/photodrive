"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

const TABS = [
  { href: "/dashboard/admin", label: "Overview" },
  { href: "/dashboard/admin/users", label: "Users" },
  { href: "/dashboard/admin/plans", label: "Plans" },
];

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
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!allowed) return null;

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <div className="aurora-bg"><span /></div>
      {/* Top nav */}
      <header className="relative z-10 border-b border-stone-200 bg-white/90 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="PhotoDrive"
              width={240}
              height={56}
              className="h-12 w-auto"
              priority
            />
            <span className="text-stone-300">|</span>
            <span className="text-xs text-[#2dabe0] font-semibold tracking-widest uppercase">Admin</span>
          </div>
          <a
            href="/dashboard"
            className="text-xs text-stone-500 hover:text-stone-900 transition-colors"
          >
            ← Dashboard
          </a>
        </div>
        {/* Back-office tabs */}
        <div className="max-w-7xl mx-auto px-6 pb-3 flex items-center gap-1.5">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-stone-900 text-white"
                    : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </header>
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-10">
        {children}
      </main>
    </div>
  );
}
