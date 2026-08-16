"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }

    // Verify admin server-side
    user.getIdToken().then((token) =>
      fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } })
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
      <header className="relative z-10 border-b border-white/[0.06] bg-[#080808]/85 backdrop-blur-xl sticky top-0">
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
            <span className="text-white/20">|</span>
            <span className="text-xs text-[#2dabe0] font-semibold tracking-widest uppercase">Admin</span>
          </div>
          <a
            href="/dashboard"
            className="text-xs text-stone-400 hover:text-white transition-colors"
          >
            ← Dashboard
          </a>
        </div>
      </header>
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-10">
        {children}
      </main>
    </div>
  );
}
