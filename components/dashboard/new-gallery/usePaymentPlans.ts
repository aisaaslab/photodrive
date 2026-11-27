"use client";

import { useEffect, useState } from "react";

export type PublicPlan = {
  id: string;
  name: string;
  description: string;
  interval: "monthly" | "yearly";
  priceCents: number;
  currency: string;
  features: string[];
  highlight: boolean;
};

/** The public plans shown in the payment step (same source as /subscribe), loaded when the step is first shown. */
export function usePaymentPlans(showPayment: boolean) {
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!showPayment || plansLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/plans");
        const data = res.ok ? await res.json() : { plans: [] };
        const list: PublicPlan[] = data.plans ?? [];
        if (cancelled) return;
        setPlans(list);
        setSelectedPlanId(list.find((p) => p.highlight)?.id ?? list[0]?.id ?? null);
      } catch {
        // No plans loaded: the buy button stays disabled (no hard-coded price).
      }
      if (!cancelled) setPlansLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [showPayment, plansLoaded]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;
  return { plans, plansLoaded, selectedPlanId, setSelectedPlanId, selectedPlan };
}
