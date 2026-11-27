"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Logo } from "@/components/ui/Logo";
import { trackPurchase } from "@/lib/tracking";

const MAX_TRIES = 40; // 40 × 1.5s ≈ 60s — the webhook is normally <5s but this
                      // leaves room for Stripe retries and slow propagation.

type OrderState = "loading" | "ok" | "invalid";
type Activation = "checking" | "ready" | "pending" | "awaiting" | "login";

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
          if (res.ok) {
            // `state` is "paid" | "pending" | "failed" (BILLING_FULFIL_V2); older
            // responses only carry `activated`. Anything but "paid" falls through
            // to polling, which ends in the pending screen with support guidance.
            const data = await res.json();
            if (data.state === "paid" || data.activated) {
              if (!cancelled) setActivation("ready");
              return;
            }
            // A delayed payment method (bank debit...): the payment is on its way and can take days. Say so, and stop polling: access
            // starts by itself when the payment clears.
            if (data.awaiting) {
              if (!cancelled) setActivation("awaiting");
              return;
            }
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
  const awaiting = activation === "awaiting";
  type StepState = "done" | "active" | "waiting" | "todo";
  const steps: { label: string; state: StepState }[] = [
    ...(confirmed ? [{ label: ss.stepPaid, state: "done" as StepState }] : []), // not claimed when Stripe has not confirmed this order
    activation === "ready" ? { label: ss.stepActivated, state: "done" }
      : activation === "awaiting" ? { label: ss.stepWaitBank, state: "waiting" }
      : activation === "login" ? { label: ss.stepLogin, state: "todo" }
      : activation === "pending" ? { label: ss.stepActivating, state: "waiting" }
      : { label: ss.stepActivating, state: "active" },
    { label: ss.stepStart, state: "todo" },
  ];
  const loginHref = `/login?next=${encodeURIComponent(
    sessionId ? `/thank-you?session_id=${sessionId}` : "/thank-you"
  )}`;

  return (
    <main className="min-h-screen bg-canvas text-fg flex flex-col px-6">
      
      <div className="relative z-10 flex items-center justify-between py-5">
        <Logo />
        <LanguageSwitcher />
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm text-center">
          {order === "loading" ? (
            <>
              <div className="w-12 h-12 border-2 border-line border-t-white/60 rounded-full animate-spin mx-auto mb-6" />
              <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
                {ss.processingTitle}
              </h1>
              <p className="text-fg-muted text-sm">{ss.processingSubtitle}</p>
            </>
          ) : (
            <>
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 border ${
                  confirmed && !awaiting ? "bg-emerald-500/20 border-emerald-500/30" : "bg-amber-500/20 border-amber-500/30"
                }`}
              >
                {confirmed && !awaiting ? (
                  <svg className="w-8 h-8 text-success-bright" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
                {awaiting ? ss.awaitingTitle : confirmed ? ss.orderTitle : activation === "ready" ? ss.successTitle : ss.pendingTitle}
              </h1>
              <p className="text-fg-muted text-sm mb-6 leading-relaxed">
                {awaiting ? ss.awaitingSubtitle : confirmed ? ss.orderSubtitle : activation === "ready" ? ss.stepActivated : ss.pendingSubtitle}
              </p>

              {/* Where things stand: payment, activation, then the first gallery */}
              <ol data-ui="order-steps" aria-label={ss.processingTitle} className="mx-auto mb-6 max-w-xs space-y-3 text-left">
                {steps.map((st) => (
                  <li key={st.label} data-state={st.state} className="flex items-center gap-3 text-sm">
                    <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs ${
                      st.state === "done" ? "border-emerald-500/40 bg-emerald-500/15 text-success-bright"
                      : st.state === "active" ? "border-accent/50 bg-accent-soft text-accent"
                      : st.state === "waiting" ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                      : "border-line text-fg-muted"}`}>
                      {st.state === "done" ? "✓" : st.state === "active" ? <span className="size-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent motion-reduce:animate-none" /> : st.state === "waiting" ? "…" : ""}
                    </span>
                    <span className={st.state === "todo" ? "text-fg-muted" : "text-fg"}>{st.label}</span>
                  </li>
                ))}
              </ol>
              {activation === "pending" && confirmed && (
                <p className="text-fg-muted text-xs mb-6 leading-relaxed">{ss.pendingSubtitle}</p>
              )}
              {activation === "login" && (
                <p className="text-fg-muted text-sm mb-6 leading-relaxed">{ss.loginPrompt}</p>
              )}

              <div className="flex flex-col gap-2">
                {activation === "login" ? (
                  <Link
                    href={loginHref}
                    className="inline-flex items-center justify-center bg-accent text-canvas font-bold px-6 py-2.5 rounded-pill text-sm hover:brightness-110 transition-all"
                  >
                    {ss.loginCta}
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/dashboard?gallery=pending"
                      className="inline-flex items-center justify-center bg-accent text-canvas font-bold px-6 py-2.5 rounded-pill text-sm hover:brightness-110 transition-all"
                    >
                      {ss.goToDashboard}
                    </Link>
                    <Link
                      href="/dashboard/account"
                      className="inline-flex items-center justify-center text-fg-muted hover:text-fg px-6 py-2 rounded-xl text-sm transition-all"
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
