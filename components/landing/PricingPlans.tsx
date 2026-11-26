"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { formatMoney } from "@/lib/shared/money";
import { PRICE_LOCALE, pricingView, tierDiscount, visibleTiers, type BillingMode, type PublicPlan } from "@/lib/shared/pricing";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn, focusRing } from "@/lib/ui/cn";
import { Icon } from "./Icon";

const fill = (text: string, pct: number) => text.replace("{pct}", String(pct));

/** One plan card. `highlight` is the recommended plan (accent border, glow, "Most popular"). Money is shown in the plan's own currency. */
function PlanCard({ name, plan, highlight, savePct }: { name: string; plan: PublicPlan; highlight: boolean; savePct: number }) {
  const { t, lang } = useLanguage();
  const p = t.landing.pricing;
  const yearly = plan.interval === "yearly";
  const price = formatMoney(plan.priceCents, plan.currency, PRICE_LOCALE[lang] ?? "en-US", { trimWholeNumbers: true });
  const features = plan.features.length > 0 ? plan.features : [t.pricing.f1, t.pricing.f2, t.pricing.f3, t.pricing.f4, t.pricing.f5, t.pricing.f6, t.pricing.f7];
  return (
    <Card tone={highlight ? "highlight" : "raised"} className={cn("flex flex-col rounded-panel", highlight ? "p-9" : "p-[37px]")}>
      <div className="flex min-h-7 items-center justify-between gap-3">
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-accent">{name}</p>
        {highlight && <Badge>{p.mostPopular}</Badge>}
      </div>
      {plan.description && <p className="mt-3 text-sm text-fg-muted">{plan.description}</p>}
      <p className="mt-5 flex items-end gap-2">
        <span className="text-[56px] font-extrabold leading-none tracking-[-0.03em] text-fg sm:text-[64px]">{price}</span>
        <span className="pb-1.5 text-[17px] text-fg-muted">{yearly ? p.perYear : p.perMonth}</span>
      </p>
      <p className="mt-5 min-h-11 text-[15px] leading-[22px] text-fg-muted">
        {yearly ? p.access365 : p.access30}{yearly && savePct > 0 && ` ${fill(p.saveVs, savePct)}`}
      </p>
      <Button
        href={`/subscribe?plan=${plan.id}`} size="lg" variant={highlight ? "primary" : "outline"}
        iconRight={<Icon name="arrow-right-dark-18" size={18} className={highlight ? "" : "invert"} />}
        className={cn("mt-6 h-[56px] w-full text-base", highlight && "shadow-[0_10px_20px_rgba(46,171,224,0.35)]")}
      >
        {p.cta}
      </Button>
      <hr className="my-7 border-line" />
      <ul className="flex flex-col gap-3.5">
        {features.map((f) => <li key={f} className="flex items-center gap-3 text-[15px] text-fg"><Icon name="check-accent-16" size={18} className="shrink-0" />{f}</li>)}
      </ul>
    </Card>
  );
}

/**
 * The plan cards of the pricing section. Plans come from the server (so prices are in the first HTML); this island only owns the billing
 * toggle. Monthly/yearly variants of a plan are paired by name; the toggle appears only when both intervals exist, defaults to yearly,
 * and carries the saving badge. With no public plans it shows the features card and a button, never a made-up price.
 */
export function PricingPlans({ plans }: { plans: PublicPlan[] }) {
  const { t } = useLanguage();
  const p = t.landing.pricing;
  const view = pricingView(plans);
  const [mode, setMode] = useState<BillingMode>(view.defaultMode);
  const shown = visibleTiers(view, mode);
  const badge = view.maxDiscount > 0 ? fill(view.discountsDiffer ? p.saveUpTo : p.save, view.maxDiscount) : null;

  if (view.tiers.length === 0) {
    const features = [t.pricing.f1, t.pricing.f2, t.pricing.f3, t.pricing.f4, t.pricing.f5, t.pricing.f6, t.pricing.f7];
    return (
      <div className="mx-auto w-full max-w-[420px]">
        <Card tone="highlight" className="rounded-panel p-9">
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-accent">{t.pricing.badge}</p>
          <p className="mt-4 text-xl font-bold text-fg">{t.pricing.vatNote}</p>
          <p className="mt-2 text-[15px] leading-[22px] text-fg-muted">{p.oneTime}</p>
          <Button href="/subscribe" size="lg" iconRight={<Icon name="arrow-right-dark-18" size={18} />} className="mt-6 h-[56px] w-full text-base">{p.cta}</Button>
          <hr className="my-7 border-line" />
          <ul className="flex flex-col gap-3.5">
            {features.map((f) => <li key={f} className="flex items-center gap-3 text-[15px] text-fg"><Icon name="check-accent-16" size={18} className="shrink-0" />{f}</li>)}
          </ul>
        </Card>
      </div>
    );
  }

  const cols = shown.length === 1 ? "max-w-[420px]" : shown.length === 2 ? "max-w-[868px] md:grid-cols-2" : "max-w-[1280px] md:grid-cols-2 lg:grid-cols-3";
  return (
    <div className="flex w-full flex-col items-center gap-10">
      {view.showToggle && (
        <div role="group" aria-label={p.toggleLabel} className="inline-flex items-center gap-1 rounded-pill border border-line bg-surface p-[5px]">
          {(["monthly", "yearly"] as const).map((m) => (
            <button
              key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
              className={cn("inline-flex h-10 items-center gap-2.5 rounded-pill px-6 text-[15px] font-bold transition-colors", mode === m ? "bg-accent text-canvas" : "text-fg-soft hover:text-fg", focusRing)}
            >
              {m === "monthly" ? p.monthly : p.yearly}
              {m === "yearly" && badge && <span className={cn("rounded-pill px-2 py-0.5 text-xs font-bold", mode === "yearly" ? "bg-canvas text-accent" : "bg-accent-soft text-accent")}>{badge}</span>}
            </button>
          ))}
        </div>
      )}
      <div className={cn("grid w-full gap-7", cols)}>
        {shown.map(({ tier, plan }) => (
          <PlanCard key={plan.id} name={tier.name} plan={plan} savePct={plan.interval === "yearly" ? tierDiscount(tier) : 0} highlight={tier.monthly?.highlight === true || tier.yearly?.highlight === true} />
        ))}
      </div>
    </div>
  );
}
