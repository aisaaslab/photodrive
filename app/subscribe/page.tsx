"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function SubscribePage() {
  const { user, loading: authLoading } = useAuth();
  const { t, lang } = useLanguage();
  const noAutoRenew = ({
    el: "Î•Ï†Î¬Ï€Î±Î¾ Ï€Î»Î·ÏÏ‰Î¼Î® Â· Ï‡Ï‰ÏÎ¯Ï‚ Î±Ï…Ï„ÏŒÎ¼Î±Ï„Î· Î±Î½Î±Î½Î­Ï‰ÏƒÎ·",
    en: "One-time payment Â· no auto-renewal",
    nl: "Eenmalige betaling Â· geen automatische verlenging",
    de: "Einmalige Zahlung Â· keine automatische VerlÃ¤ngerung",
    es: "Pago Ãºnico Â· sin renovaciÃ³n automÃ¡tica",
    it: "Pagamento unico Â· nessun rinnovo automatico",
  } as Record<string, string>)[lang] ?? "One-time payment Â· no auto-renewal";
  const s = t.subscribe;
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  const features = [s.f1, s.f2, s.f3, s.f4, s.f5, s.f6, s.f7];

  async function handleCheckout() {
    if (!user) {
      router.push("/login?next=" + encodeURIComponent("/subscribe?checkout=1"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(s.error);
      }
    } catch {
      setError(s.error);
    } finally {
      setLoading(false);
    }
  }

  // Already subscribed? Skip the pay page and go straight to the dashboard.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setChecking(false); return; }
    let cancelled = false;
    user.getIdToken().then((token) =>
      fetch("/api/user/subscription", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          if (data?.isActive) router.replace("/dashboard");
          else setChecking(false);
        })
        .catch(() => { if (!cancelled) setChecking(false); })
    );
    return () => { cancelled = true; };
  }, [user, authLoading, router]);

  // If the user just logged in to pay (CTA â†’ login â†’ back here), start checkout automatically.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (user && !checking && !autoStarted.current && new URLSearchParams(window.location.search).get("checkout") === "1") {
      autoStarted.current = true;
      handleCheckout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, checking]);

  if (checking) {
    return (
      <main className="min-h-screen bg-[#080808] text-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080808] text-white flex flex-col">
      <div className="aurora-bg"><span /></div>

      <nav className="relative z-50 flex items-center justify-between px-6 py-5">
        <Link href="/" className="font-bold text-white text-lg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          PhotoDrive
        </Link>
        <LanguageSwitcher />
      </nav>

      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">

          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
              {s.title}
            </h1>
            <p className="text-stone-400 text-sm">{s.subtitle}</p>
          </div>

          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6">

            <div className="text-center mb-6">
              <div className="flex items-end justify-center gap-1">
                <span className="text-5xl font-bold text-white">$99</span>
                <span className="text-stone-400 text-sm mb-2">{s.perYear}</span>
              </div>
              <p className="text-white text-lg font-medium mt-1">{t.pricing.vatNote}</p>
              <p className="flex items-center justify-center gap-1.5 text-stone-400 text-xs mt-2">
                <svg className="w-3.5 h-3.5 text-[#2dabe0] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                {noAutoRenew}
              </p>
            </div>

            <ul className="space-y-2.5 mb-6">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-stone-300">
                  <svg className="w-4 h-4 text-[#2dabe0] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={handleCheckout}
              disabled={loading}
              className="w-full bg-white text-stone-900 font-bold py-3 rounded-xl text-sm hover:bg-stone-100 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-stone-400 border-t-stone-900 rounded-full animate-spin" />
                  {s.loading}
                </>
              ) : (
                s.buyBtn
              )}
            </button>

            {error && <p className="text-xs text-red-400 text-center mt-3">{error}</p>}

            <p className="text-xs text-stone-600 text-center mt-4 leading-relaxed">
              {s.secureNote}
            </p>
          </div>

          <p className="text-xs text-stone-600 text-center mt-5 leading-relaxed">
            {s.hasAccount}{" "}
            <Link href="/login" className="text-stone-400 hover:text-white transition-colors underline underline-offset-2">
              {s.signIn}
            </Link>
          </p>

        </div>
      </div>
    </main>
  );
}
