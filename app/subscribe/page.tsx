"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { APP_NAME } from "@/lib/branding";

type PublicPlan = {
  id: string;
  name: string;
  description: string;
  interval: "monthly" | "yearly";
  priceCents: number;
  features: string[];
  highlight: boolean;
};

export default function SubscribePage() {
  const { user, loading: authLoading } = useAuth();
  const { t, lang } = useLanguage();
  const noAutoRenew = ({
    el: "Εφάπαξ πληρωμή · χωρίς αυτόματη ανανέωση",
    en: "One-time payment · no auto-renewal",
    nl: "Eenmalige betaling · geen automatische verlenging",
    de: "Einmalige Zahlung · keine automatische Verlängerung",
    es: "Pago único · sin renovación automática",
    it: "Pagamento unico · nessun rinnovo automatico",
  } as Record<string, string>)[lang] ?? "One-time payment · no auto-renewal";
  const perInterval = ({
    el: { monthly: "/ μήνα", yearly: "/ χρόνο" },
    en: { monthly: "/ month", yearly: "/ year" },
    nl: { monthly: "/ maand", yearly: "/ jaar" },
    de: { monthly: "/ Monat", yearly: "/ Jahr" },
    es: { monthly: "/ mes", yearly: "/ año" },
    it: { monthly: "/ mese", yearly: "/ anno" },
  } as Record<string, Record<string, string>>)[lang] ?? { monthly: "/ month", yearly: "/ year" };
  const s = t.subscribe;
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  // Plans (public listing, or a single plan by ?plan= — allows private plan
  // links the admin shares with a specific client).
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  async function loadPlans() {
    const planParam = new URLSearchParams(window.location.search).get("plan");
    try {
      if (planParam) {
        const res = await fetch(`/api/plans/${encodeURIComponent(planParam)}`);
        if (res.ok) {
          const data = await res.json();
          setPlans([data.plan]);
          setSelectedPlanId(data.plan.id);
          setPlansLoaded(true);
          return;
        }
      }
      const res = await fetch("/api/plans");
      const data = res.ok ? await res.json() : { plans: [] };
      const list: PublicPlan[] = data.plans ?? [];
      setPlans(list);
      // Default: first public plan, preferring the highlighted one.
      setSelectedPlanId(list.find((p) => p.highlight)?.id ?? list[0]?.id ?? null);
    } catch {
      setPlans([]);
    }
    setPlansLoaded(true);
  }

  useEffect(() => { loadPlans(); }, []);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;

  async function handleCheckout() {
    if (!user) {
      // Keep the chosen plan through the login round-trip (?checkout=1 also
      // auto-starts checkout once the user is back).
      const planSuffix = selectedPlan ? `&plan=${selectedPlan.id}` : "";
      router.push("/login?next=" + encodeURIComponent(`/subscribe?checkout=1${planSuffix}`));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(selectedPlan ? { planId: selectedPlan.id } : {}),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.alreadyPaid) {
        // A paid session already exists — the route activated it, so go to
        // the account page instead of charging again.
        router.replace("/dashboard/account");
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

  // If the user just logged in to pay (CTA → login → back here), start checkout
  // automatically — once the plans have loaded so the selection isn't lost.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (user && !checking && plansLoaded && !autoStarted.current && new URLSearchParams(window.location.search).get("checkout") === "1") {
      autoStarted.current = true;
      handleCheckout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, checking, plansLoaded]);

  if (checking) {
    return (
      <main className="min-h-screen bg-[#080808] text-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </main>
    );
  }

  function formatPrice(cents: number) {
    const v = cents / 100;
    return `$${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)}`;
  }

  return (
    <main className="min-h-screen bg-[#080808] text-white flex flex-col">
      <div className="aurora-bg"><span /></div>

      <nav className="relative z-50 flex items-center justify-between px-6 py-5">
        <Link href="/" className="font-bold text-white text-lg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {APP_NAME}
        </Link>
        <LanguageSwitcher />
      </nav>

      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <div className={`w-full ${plans.length > 1 ? "max-w-4xl" : "max-w-sm"}`}>

          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
              {s.title}
            </h1>
            <p className="text-stone-400 text-sm">{s.subtitle}</p>
          </div>

          {!plansLoaded ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          ) : plans.length > 1 ? (
            /* Plan picker */
            <div className="grid sm:grid-cols-2 gap-4">
              {plans.map((plan) => {
                const selected = plan.id === selectedPlanId;
                return (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`text-left border rounded-2xl p-6 transition-all ${
                      selected
                        ? "border-[#17509e] bg-[#17509e]/10 ring-1 ring-[#17509e]/40"
                        : "border-white/[0.08] bg-white/[0.03] hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-sm font-bold tracking-widest uppercase text-[#2dabe0]">{plan.name}</span>
                      {selected && (
                        <span className="w-5 h-5 rounded-full bg-[#17509e] flex items-center justify-center shrink-0">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </span>
                      )}
                    </div>
                    {plan.description && <p className="text-xs text-stone-400 mb-3">{plan.description}</p>}
                    <div className="flex items-end gap-1 mb-4">
                      <span className="text-3xl font-bold text-white">{formatPrice(plan.priceCents)}</span>
                      <span className="text-stone-400 text-xs mb-1">{perInterval[plan.interval]}</span>
                    </div>
                    <ul className="space-y-2">
                      {plan.features.slice(0, 4).map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-stone-300">
                          <svg className="w-3.5 h-3.5 text-[#2dabe0] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
          ) : selectedPlan ? null : (
            /* Legacy default card (before any plans exist) */
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
                {[s.f1, s.f2, s.f3, s.f4, s.f5, s.f6, s.f7].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-stone-300">
                    <svg className="w-4 h-4 text-[#2dabe0] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Selected plan summary + buy button (plan mode) */}
          {plansLoaded && selectedPlan && (
            <div className="mt-6 bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6">
              <div className="text-center mb-5">
                <div className="flex items-end justify-center gap-1">
                  <span className="text-4xl font-bold text-white">{formatPrice(selectedPlan.priceCents)}</span>
                  <span className="text-stone-400 text-sm mb-1.5">{perInterval[selectedPlan.interval]}</span>
                </div>
                <p className="text-white text-base font-medium mt-1">{t.pricing.vatNote}</p>
                <p className="flex items-center justify-center gap-1.5 text-stone-400 text-xs mt-2">
                  <svg className="w-3.5 h-3.5 text-[#2dabe0] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                  {noAutoRenew}
                </p>
              </div>
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
            </div>
          )}

          {/* Legacy single-card buy button */}
          {plansLoaded && !selectedPlan && (
            <button
              onClick={handleCheckout}
              disabled={loading}
              className="w-full mt-6 bg-white text-stone-900 font-bold py-3 rounded-xl text-sm hover:bg-stone-100 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
          )}

          {error && <p className="text-xs text-red-400 text-center mt-3">{error}</p>}

          <p className="text-xs text-stone-600 text-center mt-4 leading-relaxed">
            {s.secureNote}
          </p>

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
