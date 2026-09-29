"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { trackPurchase } from "@/lib/tracking";

const MAX_TRIES = 40; // 40 × 1.5s ≈ 60s — the webhook is normally <5s but this
                      // leaves room for Stripe retries and slow propagation.

type OrderState = "loading" | "ok" | "invalid";
type Activation = "checking" | "ready" | "pending" | "login";

export default function ThankYouPage() {
  return (
    <Suspense>
      <ThankYouContent />
    </Suspense>
  );
}

function ThankYouContent() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [order, setOrder] = useState<OrderState>(sessionId ? "loading" : "invalid");
  const [activation, setActivation] = useState<Activation>("checking");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Conversion tracking — deliberately independent of login. The visitor may
  //    have lost their session while on Stripe, and the purchase must still be
  //    reported. Value/currency come from Stripe via the server, not the URL.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/stripe/order?session_id=${encodeURIComponent(sessionId)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (cancelled) return;
        setOrder("ok");
        trackPurchase({ transactionId: data.transactionId, value: data.value, currency: data.currency });
      } catch {
        if (!cancelled) setOrder("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // 2. Account activation — needs a signed-in user. No forced redirect: if the
  //    session is gone we offer a login link and keep the confirmation visible.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setActivation("login");
      return;
    }

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

    async function activate() {
      setActivation("checking");
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
            if (!cancelled) setActivation("ready");
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
            setActivation("ready");
            return;
          }
        } catch {}

        if (tries < MAX_TRIES) {
          timerRef.current = setTimeout(poll, 1500);
        } else {
          setActivation("pending");
        }
      }

      poll();
    }

    activate();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user, loading, sessionId]);

  const ss = t.subscribeSuccess;
  const confirmed = order === "ok";
  const loginHref = `/login?next=${encodeURIComponent(
    sessionId ? `/thank-you?session_id=${sessionId}` : "/thank-you"
  )}`;

  return (
    <main className="min-h-screen bg-[#080808] text-white flex flex-col px-6">
      <div className="aurora-bg"><span /></div>
      <div className="relative z-10 flex items-center justify-between py-5">
        <span className="font-bold text-white text-lg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>PhotoDrive</span>
        <LanguageSwitcher />
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm text-center">
          {order === "loading" ? (
            <>
              <div className="w-12 h-12 border-2 border-white/10 border-t-white/60 rounded-full animate-spin mx-auto mb-6" />
              <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
                {ss.processingTitle}
              </h1>
              <p className="text-stone-400 text-sm">{ss.processingSubtitle}</p>
            </>
          ) : (
            <>
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 border ${
                  confirmed ? "bg-emerald-500/20 border-emerald-500/30" : "bg-amber-500/20 border-amber-500/30"
                }`}
              >
                {confirmed ? (
                  <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
                {confirmed ? ss.orderTitle : ss.pendingTitle}
              </h1>
              <p className="text-stone-400 text-sm mb-6 leading-relaxed">
                {confirmed ? ss.orderSubtitle : ss.pendingSubtitle}
              </p>

              {activation === "checking" && (
                <div className="flex items-center justify-center gap-2 text-stone-500 text-xs mb-6">
                  <div className="w-3.5 h-3.5 border-2 border-white/10 border-t-white/50 rounded-full animate-spin" />
                  {ss.processingTitle}
                </div>
              )}
              {activation === "pending" && confirmed && (
                <p className="text-stone-500 text-xs mb-6 leading-relaxed">{ss.pendingSubtitle}</p>
              )}
              {activation === "login" && (
                <p className="text-stone-400 text-sm mb-6 leading-relaxed">{ss.loginPrompt}</p>
              )}

              <div className="flex flex-col gap-2">
                {activation === "login" ? (
                  <Link
                    href={loginHref}
                    className="inline-flex items-center justify-center bg-white text-stone-900 font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-stone-100 transition-all"
                  >
                    {ss.loginCta}
                  </Link>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
