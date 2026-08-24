"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const MAX_TRIES = 40; // 40 × 1.5s ≈ 60s — the webhook is normally <5s but this
                      // leaves room for Stripe retries and slow propagation.

export default function SuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}

function SuccessContent() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sessionId = searchParams.get("session_id");

  // If the auth session is lost (e.g. cookie cleared mid-checkout), send the
  // user through login and back — previously this page spun forever.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      const next = sessionId
        ? `/subscribe/success?session_id=${encodeURIComponent(sessionId)}`
        : "/subscribe/success";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [loading, user, router, sessionId]);

  useEffect(() => {
    if (loading || !user) return;

    let cancelled = false;
    let tries = 0;

    async function checkSubscription(): Promise<boolean> {
      const token = await user!.getIdToken();
      const res = await fetch("/api/user/subscription", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return !!data.isActive;
    }

    function finish() {
      setReady(true);
      setChecking(false);
      setTimeout(() => router.replace("/dashboard?gallery=pending"), 2000);
    }

    async function activate() {
      // Reconcile with Stripe FIRST: if the webhook failed or was slow, this
      // fetches the session server-side and activates the subscription
      // directly, so the user never gets stuck on the pending screen.
      if (sessionId) {
        try {
          const token = await user!.getIdToken();
          const res = await fetch("/api/stripe/verify", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ sessionId }),
          });
          if (res.ok && (await res.json()).activated) {
            if (!cancelled) finish();
            return;
          }
        } catch {}
      }

      // Webhook may still land while we poll — up to ~60s.
      async function poll() {
        if (cancelled) return;
        tries++;
        try {
          if (await checkSubscription()) {
            finish();
            return;
          }
        } catch {}

        if (tries < MAX_TRIES) {
          timerRef.current = setTimeout(poll, 1500);
        } else {
          setChecking(false);
        }
      }

      poll();
    }

    activate();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user, loading, router, sessionId]);

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
            <div className="flex flex-col gap-2">
              <Link
                href="/dashboard?gallery=pending"
                className="inline-flex items-center justify-center bg-white text-stone-900 font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-stone-100 transition-all"
              >
                {ss.goToDashboard}
              </Link>
              <Link
                href="/dashboard/account"
                className="inline-flex items-center justify-center text-white/60 hover:text-white px-6 py-2 rounded-xl text-sm transition-all"
              >
                {ss.viewAccount}
              </Link>
            </div>
          </>
        )}
      </div>
      </div>
    </main>
  );
}
