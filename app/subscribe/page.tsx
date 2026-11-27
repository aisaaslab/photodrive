"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { LOCALES, useLanguage } from "@/lib/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Logo } from "@/components/ui/Logo";
import { computeExpiry, isLifetime, periodMs } from "@/lib/shared/billing-access";
import { formatMoney } from "@/lib/shared/money";
import { buildTiers, tierDiscount } from "@/lib/shared/pricing";

type PublicPlan = {
  id: string;
  name: string;
  description: string;
  interval: "monthly" | "yearly";
  priceCents: number;
  currency: string;
  features: string[];
  highlight: boolean;
  sortOrder?: number;
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
  // Current subscription, for the "renewing extends your access to …" note. Only set
  // when the user may buy while active (server flag canRenewEarly) or has lapsed.
  const [sub, setSub] = useState<{ isActive: boolean; expiresAt: number } | null>(null);

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
  // The yearly plan's saving against twelve monthly payments, for a monthly + yearly pair of the same offer (same rule as the landing page).
  const savings = new Map<string, number>();
  for (const tier of buildTiers(plans.map((p) => ({ ...p, sortOrder: p.sortOrder ?? 0 })))) {
    if (tier.yearly) savings.set(tier.yearly.id, tierDiscount(tier));
  }

  async function handleCheckout() {
    if (!selectedPlan) return;
    if (!user) {
      // Keep the chosen plan through the login round-trip (?checkout=1 also
      // auto-starts checkout once the user is back).
      const planSuffix = `&plan=${selectedPlan.id}`;
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
        body: JSON.stringify({ planId: selectedPlan.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.alreadyPaid) {
        // Legacy response (BILLING_FULFIL_V2 off only): a paid session already exists
        // and the route activated it. The new checkout never returns this; remove
        // together with the old path.
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
          // Active users go straight to the dashboard unless the server lets them renew early.
          // Admins and lifetime accounts have nothing to buy.
          const expiresAt = typeof data?.expiresAt === "number" ? data.expiresAt : 0;
          const nothingToBuy = data?.status === "admin" || isLifetime(expiresAt);
          if (data?.isActive && (nothingToBuy || !data?.canRenewEarly)) {
            router.replace("/dashboard");
            return;
          }
          if (expiresAt > 0) setSub({ isActive: !!data?.isActive, expiresAt });
          setChecking(false);
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
      <main className="min-h-screen bg-canvas text-fg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-fg-muted/30 border-t-white rounded-full animate-spin" />
      </main>
    );
  }

  const fmtDate = (ms: number) =>
    new Date(ms).toLocaleDateString(LOCALES[lang], { year: "numeric", month: "long", day: "numeric" });
  const withDate = (text: string, ms: number) => text.replace("{date}", fmtDate(ms));
  const buyLabel = sub?.isActive ? s.renewBtn : s.buyBtn;

  // Each plan is shown in its own currency, formatted for the visitor's language (D4).
  const formatPrice = (plan: Pick<PublicPlan, "priceCents" | "currency">) =>
    formatMoney(plan.priceCents, plan.currency, LOCALES[lang], { trimWholeNumbers: true });

  return (
    <main className="min-h-screen bg-canvas text-fg flex flex-col">
      

      <nav className="relative z-50 flex items-center justify-between px-6 py-5">
        <Link href="/" className="rounded-tile"><Logo /></Link>
        <LanguageSwitcher />
      </nav>

      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <div className={`w-full ${plans.length > 1 ? "max-w-4xl" : "max-w-sm"}`}>

          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
              {s.title}
            </h1>
            <p className="text-fg-muted text-sm">{s.subtitle}</p>
          </div>

          {sub && (
            <div className="mb-6 rounded-xl border border-line bg-surface px-4 py-3 text-center text-sm">
              <p className={sub.isActive ? "text-fg-soft" : "text-amber-300"}>
                {withDate(sub.isActive ? s.currentAccess : s.expiredAccess, sub.expiresAt)}
              </p>
              {selectedPlan && (
                <p className="mt-1 text-fg font-medium">
                  {withDate(
                    s.renewExtends,
                    computeExpiry({
                      now: Date.now(),
                      currentExpiresAt: sub.expiresAt,
                      grantedMs: periodMs(selectedPlan.interval),
                    }),
                  )}
                </p>
              )}
            </div>
          )}

          {!plansLoaded ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-fg-muted/30 border-t-white rounded-full animate-spin" />
            </div>
          ) : plans.length > 1 ? (
            /* Plan picker: a real radio group (arrow keys, one tab stop, announced as "1 of 2") */
            <fieldset className="border-0 p-0 m-0 min-w-0">
              <legend className="sr-only">{s.planGroup}</legend>
              <div className="grid sm:grid-cols-2 gap-4">
                {plans.map((plan) => {
                  const selected = plan.id === selectedPlanId;
                  const saving = savings.get(plan.id) ?? 0;
                  const badge = saving > 0 ? t.landing.pricing.save.replace("{pct}", String(saving)) : plan.highlight ? t.landing.pricing.mostPopular : null;
                  return (
                    <label
                      key={plan.id}
                      data-ui="plan-option"
                      className={`relative block cursor-pointer text-left border rounded-card p-6 transition-all focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
                        selected
                          ? "border-accent-deep bg-accent-deep/10 ring-1 ring-accent-deep/40"
                          : "border-line bg-surface hover:border-fg-muted/30"
                      }`}
                    >
                      <input type="radio" name="plan" value={plan.id} checked={selected} onChange={() => setSelectedPlanId(plan.id)} className="sr-only" />
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-sm font-bold tracking-widest uppercase text-accent">{plan.name}</span>
                        {badge ? (
                          <span className="rounded-pill bg-accent px-2.5 py-1 text-[11px] font-bold text-canvas">{badge}</span>
                        ) : selected ? (
                          <span aria-hidden className="w-5 h-5 rounded-full bg-accent-deep flex items-center justify-center shrink-0">
                            <svg className="w-3 h-3 text-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          </span>
                        ) : null}
                      </div>
                      {plan.description && <p className="text-xs text-fg-muted mb-3">{plan.description}</p>}
                      <div className="flex items-end gap-1">
                        <span className="text-3xl font-bold text-fg">{formatPrice(plan)}</span>
                        <span className="text-fg-muted text-xs mb-1">{perInterval[plan.interval]}</span>
                      </div>
                      <p className="mb-4 mt-1 min-h-4 text-xs text-fg-muted">
                        {plan.interval === "yearly" && saving > 0
                          ? s.perMonthEquivalent.replace("{price}", formatMoney(Math.round(plan.priceCents / 12), plan.currency, LOCALES[lang], { trimWholeNumbers: false }))
                          : ""}
                      </p>
                      <ul className="space-y-2">
                        {plan.features.slice(0, 4).map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-fg-soft">
                            <svg aria-hidden className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : selectedPlan ? null : (
            /* No purchasable plan loaded: never show a hard-coded price. */
            <p className="text-center text-sm text-fg-muted py-8">{s.error}</p>
          )}

          {/* Selected plan summary + buy button (plan mode) */}
          {plansLoaded && selectedPlan && (
            <div className="mt-6 bg-surface border border-line rounded-card p-6">
              <div className="text-center mb-5">
                <div className="flex items-end justify-center gap-1">
                  <span className="text-4xl font-bold text-fg">{formatPrice(selectedPlan)}</span>
                  <span className="text-fg-muted text-sm mb-1.5">{perInterval[selectedPlan.interval]}</span>
                </div>
                <p className="text-fg text-base font-medium mt-1">{selectedPlan.interval === "yearly" ? t.pricing.vatNote : t.pricing.vatNoteMonthly}</p>
                {selectedPlan.interval === "yearly" && (
                  <p className="flex items-center justify-center gap-1.5 text-fg-muted text-xs mt-2">
                    <svg className="w-3.5 h-3.5 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                    {noAutoRenew}
                  </p>
                )}
              </div>
              <ul className="mb-5 space-y-2 border-t border-line pt-4">
                {(selectedPlan.features.length > 0 ? selectedPlan.features : [t.pricing.f1, t.pricing.f2, t.pricing.f3, t.pricing.f4, t.pricing.f5, t.pricing.f6, t.pricing.f7]).map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-fg-soft">
                    <svg className="mt-0.5 size-4 shrink-0 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={handleCheckout}
                disabled={loading}
                className="w-full bg-accent text-canvas font-bold py-3 rounded-pill text-sm hover:brightness-110 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-canvas/30 border-t-canvas rounded-full animate-spin" />
                    {s.loading}
                  </>
                ) : (
                  buyLabel
                )}
              </button>
            </div>
          )}

          {error && <p role="alert" className="text-xs text-danger text-center mt-3">{error}</p>}

          <p className="text-xs text-fg-muted text-center mt-4 leading-relaxed">
            {s.secureNote}
          </p>

          <p className="text-xs text-fg-muted text-center mt-5 leading-relaxed">
            <span className="whitespace-nowrap">{s.hasAccount}</span>{" "}
            <Link href="/login" className="text-fg-muted hover:text-fg transition-colors underline underline-offset-2 whitespace-nowrap">
              {s.signIn}
            </Link>
          </p>

        </div>
      </div>
    </main>
  );
}
