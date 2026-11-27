/**
 * Pricing tiers for the landing page: pure helpers shared by server and client (S6-07). Moved from the old landing page so they can
 * be tested. A *tier* is the monthly and yearly variants of one plan, paired by (normalised) name.
 */
export type PublicPlan = {
  id: string;
  name: string;
  description: string;
  interval: "monthly" | "yearly";
  priceCents: number; // minor units of `currency`, a misnomer kept for the stored field
  currency: string;
  features: string[];
  highlight: boolean;
  sortOrder: number;
};

export type PlanTier = { key: string; name: string; monthly: PublicPlan | null; yearly: PublicPlan | null; sortOrder: number };
export type BillingMode = "monthly" | "yearly";

/** Pair monthly/yearly variants by name (or, for a lone monthly and a lone yearly plan, regardless of name), ordered by sort order then name. A tier only appears in the modes it has a variant for. */
export function buildTiers(plans: PublicPlan[]): PlanTier[] {
  const map = new Map<string, PlanTier>();
  for (const p of plans) {
    const key = p.name.trim().toLowerCase();
    let tier = map.get(key);
    if (!tier) {
      tier = { key, name: p.name.trim(), monthly: null, yearly: null, sortOrder: p.sortOrder ?? 0 };
      map.set(key, tier);
    }
    if (p.interval === "monthly") tier.monthly = p;
    else tier.yearly = p;
    tier.sortOrder = Math.min(tier.sortOrder, p.sortOrder ?? 0);
  }
  const tiers = [...map.values()];
  // The admin often names the two variants differently ("Monthly" / "Yearly", "Pro" / "Pro annual"). When the whole list is exactly one
  // monthly and one yearly plan they are the two prices of the same offer, so they pair and the yearly one can show its saving.
  const monthlyOnly = tiers.filter((t) => t.monthly && !t.yearly);
  const yearlyOnly = tiers.filter((t) => t.yearly && !t.monthly);
  if (tiers.length === 2 && monthlyOnly.length === 1 && yearlyOnly.length === 1) {
    const [m, y] = [monthlyOnly[0], yearlyOnly[0]];
    return [{ key: m.key, name: m.name, monthly: m.monthly, yearly: y.yearly, sortOrder: Math.min(m.sortOrder, y.sortOrder) }];
  }
  return tiers.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "en"));
}

/** Whole-percent saving of the yearly price against twelve monthly payments; 0 when there is none. Both prices must be in one currency. */
export function discountPct(monthlyMinor: number, yearlyMinor: number): number {
  if (monthlyMinor <= 0 || yearlyMinor <= 0) return 0;
  const perMonth = yearlyMinor / 12;
  if (perMonth >= monthlyMinor) return 0;
  return Math.round((1 - perMonth / monthlyMinor) * 100);
}

/** A tier's saving, only when its two variants share a currency (otherwise a percentage would be meaningless). */
export function tierDiscount(tier: PlanTier): number {
  if (!tier.monthly || !tier.yearly || tier.monthly.currency.toLowerCase() !== tier.yearly.currency.toLowerCase()) return 0;
  return discountPct(tier.monthly.priceCents, tier.yearly.priceCents);
}

export type PricingView = {
  tiers: PlanTier[];
  /** Whether to show the billing toggle: only when both intervals have at least one plan. */
  showToggle: boolean;
  /** The mode shown first: yearly (the discounted one) when it exists. */
  defaultMode: BillingMode;
  /** Largest saving among the paired tiers, and whether the savings differ (for "Save up to"). */
  maxDiscount: number;
  discountsDiffer: boolean;
};

export function pricingView(plans: PublicPlan[]): PricingView {
  const tiers = buildTiers(plans);
  const hasMonthly = tiers.some((t) => t.monthly);
  const hasYearly = tiers.some((t) => t.yearly);
  const discounts = tiers.map(tierDiscount).filter((d) => d > 0);
  return {
    tiers,
    showToggle: hasMonthly && hasYearly,
    defaultMode: hasYearly ? "yearly" : "monthly",
    maxDiscount: discounts.length ? Math.max(...discounts) : 0,
    discountsDiffer: new Set(discounts).size > 1,
  };
}

/** The tiers to show in a mode, each with the plan to sell. With no toggle the mode is whichever interval exists. */
export function visibleTiers(view: PricingView, mode: BillingMode): { tier: PlanTier; plan: PublicPlan }[] {
  const effective: BillingMode = view.showToggle ? mode : view.defaultMode;
  return view.tiers.flatMap((tier) => {
    const plan = effective === "yearly" ? tier.yearly : tier.monthly;
    return plan ? [{ tier, plan }] : [];
  });
}

/** Locale used to format plan prices on the landing page. English is US English (D19: the main market is the United States), so a USD
 *  plan reads "$99"; `LOCALES` in lib/i18n/languages.ts (dates) is en-US too. */
export const PRICE_LOCALE: Record<string, string> = { en: "en-US", el: "el-GR", nl: "nl-NL", de: "de-DE", es: "es-ES", it: "it-IT" };
