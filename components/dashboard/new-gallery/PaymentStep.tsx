"use client";

import { LOCALES, useLanguage } from "@/lib/i18n";
import { formatMoney } from "@/lib/shared/money";
import type { usePaymentPlans } from "./usePaymentPlans";

const PER_INTERVAL: Record<string, Record<"monthly" | "yearly", string>> = {
  el: { monthly: "/ μήνα", yearly: "/ χρόνο" },
  en: { monthly: "/ month", yearly: "/ year" },
  nl: { monthly: "/ maand", yearly: "/ jaar" },
  de: { monthly: "/ Monat", yearly: "/ Jahr" },
  es: { monthly: "/ mes", yearly: "/ año" },
  it: { monthly: "/ mese", yearly: "/ anno" },
};

/** Shown in place of the form when creating a gallery needs a subscription: the public plans, what is included, and the buy button. */
export function PaymentStep({
  payment, error, checkoutLoading, onBack, onCheckout,
}: {
  payment: ReturnType<typeof usePaymentPlans>;
  error: string;
  checkoutLoading: boolean;
  onBack: () => void;
  onCheckout: () => void;
}) {
  const { t, lang } = useLanguage();
  const f = t.newGalleryForm;
  const { plans, plansLoaded, selectedPlanId, setSelectedPlanId, selectedPlan } = payment;
  const perInterval = PER_INTERVAL[lang] ?? PER_INTERVAL.en;
  const features =
    selectedPlan && selectedPlan.features.length > 0
      ? selectedPlan.features
      : [f.f1, f.f2, f.f3, f.f4, f.f5, f.f6];

  return (
    <div className="bg-[#111111] border border-white/[0.1] rounded-2xl overflow-hidden animate-scale-in">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div>
          <h2 className="font-semibold text-white" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{f.subscriptionTitle}</h2>
          <p className="text-xs text-white/60 mt-0.5">{f.subscriptionSubtitle}</p>
        </div>
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-6">
        {!plansLoaded ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : plans.length > 0 ? (
          <div className="space-y-2 mb-5">
            {plans.map((plan) => {
              const selected = plan.id === selectedPlanId;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlanId(plan.id)}
                  aria-pressed={selected}
                  className={`w-full text-left flex items-center gap-3 border rounded-xl px-4 py-3 transition-all ${
                    selected
                      ? "border-[#17509e] bg-[#17509e]/10 ring-1 ring-[#17509e]/40"
                      : "border-white/[0.08] bg-white/[0.03] hover:border-white/20"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${
                      selected ? "border-[#2dabe0]" : "border-white/30"
                    }`}
                  >
                    {selected && <span className="w-2 h-2 rounded-full bg-[#2dabe0]" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white truncate">{plan.name}</span>
                    {plan.description && (
                      <span className="block text-xs text-stone-500 truncate">{plan.description}</span>
                    )}
                  </span>
                  <span className="text-right shrink-0">
                    <span className="text-lg font-bold text-white">{formatMoney(plan.priceCents, plan.currency, LOCALES[lang], { trimWholeNumbers: true })}</span>
                    <span className="text-stone-500 text-xs ml-1">{perInterval[plan.interval]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          /* No purchasable plan: never show a hard-coded price. */
          <p className="text-center text-sm text-stone-400 mb-5">{f.error}</p>
        )}

        <ul className="space-y-2 mb-6">
          {features.map((feat) => (
            <li key={feat} className="flex items-center gap-2 text-sm text-stone-300">
              <svg className="w-3.5 h-3.5 text-[#2dabe0] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              {feat}
            </li>
          ))}
        </ul>

        <button
          onClick={onCheckout}
          disabled={checkoutLoading || !plansLoaded || !selectedPlan}
          className="w-full bg-white text-stone-900 font-bold py-3 rounded-xl text-sm hover:bg-stone-100 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {checkoutLoading ? (
            <div className="w-4 h-4 border-2 border-stone-400 border-t-stone-900 rounded-full animate-spin" />
          ) : (
            f.buy
          )}
        </button>

        {error && <p className="text-xs text-red-400 text-center mt-3">{error}</p>}

        <button
          onClick={onBack}
          className="w-full mt-2 text-stone-500 hover:text-white text-xs py-2 transition-colors"
        >
          {f.backToForm}
        </button>
      </div>
    </div>
  );
}
