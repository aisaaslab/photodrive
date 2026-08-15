"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function SuccessPage() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (loading || !user) return;

    let tries = 0;

    async function check() {
      tries++;
      setAttempts(tries);
      try {
        const token = await user!.getIdToken();
        const res = await fetch("/api/user/subscription", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.isActive) {
          setReady(true);
          setChecking(false);
          setTimeout(() => router.replace("/dashboard?gallery=pending"), 2000);
          return;
        }
      } catch {}

      if (tries < 8) {
        setTimeout(check, 1500);
      } else {
        setChecking(false);
      }
    }

    check();
  }, [user, loading, router]);

  const ss = t.subscribeSuccess;

  return (
    <main className="min-h-screen bg-[#080808] text-white flex flex-col px-6">
      <div className="aurora-bg"><span /></div>
      <div className="relative z-10 flex items-center justify-between py-5">
        <span className="font-bold text-white text-lg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>PhotoDrive</span>
        <LanguageSwitcher />
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center">
      <div className="w-full max-w-sm text-center">
        {checking ? (
          <>
            <div className="w-12 h-12 border-2 border-white/10 border-t-white/60 rounded-full animate-spin mx-auto mb-6" />
            <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
              {ss.processingTitle}
            </h1>
            <p className="text-stone-400 text-sm">{ss.processingSubtitle}</p>
          </>
        ) : ready ? (
          <>
            <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
              {ss.successTitle}
            </h1>
            <p className="text-stone-400 text-sm">{ss.successSubtitle}</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-amber-500/20 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
              {ss.pendingTitle}
            </h1>
            <p className="text-stone-400 text-sm mb-6 leading-relaxed">
              {ss.pendingSubtitle}
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center bg-white text-stone-900 font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-stone-100 transition-all"
            >
              {ss.goToDashboard}
            </Link>
          </>
        )}
      </div>
      </div>
    </main>
  );
}
