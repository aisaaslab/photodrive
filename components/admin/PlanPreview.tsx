"use client";

import { PricingPlans } from "@/components/landing/PricingPlans";
import type { PublicPlan } from "@/lib/shared/pricing";
import type { PlanWarning } from "@/lib/shared/plan-input";

/**
 * How the plan being edited will look on the landing page (S8-03): the REAL pricing section (`PricingPlans`), fed with the plans that are
 * live today plus this draft, so pairing by name, the billing toggle and the "save N %" badge appear exactly as customers will see them.
 * It is a picture, not a control: its buttons do nothing here (the region is inert).
 */
export function PlanPreview({ plans, warnings, ready }: { plans: PublicPlan[]; warnings: PlanWarning[]; ready: boolean }) {
  return (
    <section aria-labelledby="plan-preview-title" data-ui="plan-preview" className="min-w-0">
      <h3 id="plan-preview-title" className="text-xs font-semibold tracking-wide uppercase text-fg-muted mb-3">Preview on the landing page</h3>
      {warnings.length > 0 && (
        <ul className="mb-3 space-y-2" data-ui="plan-warnings">
          {warnings.map((w) => (
            <li key={w.text} className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${w.level === "warn" ? "border-amber-500/30 bg-amber-500/[0.07] text-amber-200" : "border-line bg-surface text-fg-soft"}`}>{w.text}</li>
          ))}
        </ul>
      )}
      {ready ? (
        <div className="rounded-card border border-line bg-canvas p-4 sm:p-6 overflow-hidden" inert>
          <div className="origin-top scale-[0.8] sm:scale-90 -mb-[12%] sm:-mb-[6%]" style={{ width: "100%" }}>
            <PricingPlans plans={plans} />
          </div>
        </div>
      ) : (
        <p className="rounded-card border border-dashed border-line px-4 py-10 text-center text-sm text-fg-muted">Enter a valid price to see the preview.</p>
      )}
      <p className="mt-2 text-xs text-fg-muted">Shown in your current language, with the plans that are live now plus this one as if it were public.</p>
    </section>
  );
}
