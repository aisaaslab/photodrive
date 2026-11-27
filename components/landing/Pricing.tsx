import type { Translations } from "@/lib/i18n";
import type { PublicPlan } from "@/lib/shared/pricing";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Icon } from "./Icon";
import { PricingPlans } from "./PricingPlans";

/** Pricing (design node 8:151): header, then the plans (a client island for the billing toggle), then the secure-checkout note. */
export function Pricing({ t, plans }: { t: Translations; plans: PublicPlan[] }) {
  const p = t.landing.pricing;
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-4">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-10 px-4 pb-20 pt-4 sm:px-8 lg:gap-12 lg:pb-[120px] xl:px-20">
        <SectionHeader eyebrow={t.pricing.label} title={<span id="pricing-title">{p.title}</span>} lead={p.lead} />
        <PricingPlans plans={plans} />
        <p className="flex items-center gap-2 text-[15px] text-fg-muted"><Icon name="lock-muted-13" size={16} />{p.secure}</p>
      </div>
    </section>
  );
}
