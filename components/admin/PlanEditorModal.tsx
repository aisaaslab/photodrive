"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatMoney } from "@/lib/shared/money";
import { CURRENCY_NAME, PLAN_CURRENCIES, planWarnings, toMinorUnits, type PlanCurrency } from "@/lib/shared/plan-input";
import { PlanBody } from "@/lib/shared/schemas/plans";
import type { PublicPlan } from "@/lib/shared/pricing";
import type { PlanDoc } from "@/lib/firestore/types";
import { PlanPreview } from "./PlanPreview";

export type PlanDraft = {
  id?: string;
  name: string;
  description: string;
  interval: "monthly" | "yearly";
  currency: PlanCurrency;
  /** In the currency's major units, as typed ("99", "99.90", "4800"). */
  price: string;
  features: string[];
  isPublic: boolean;
  active: boolean;
  highlight: boolean;
  sortOrder: string;
};

export const emptyDraft: PlanDraft = {
  name: "", description: "", interval: "yearly", currency: "usd", price: "", features: [], isPublic: true, active: true, highlight: false, sortOrder: "0",
};

const textarea = "w-full rounded-tile border border-line bg-surface-2 px-4 py-3 text-[15px] text-fg placeholder:text-fg-muted hover:border-fg-muted/50 focus:outline-none focus-visible:border-accent resize-none";
const select = "h-12 w-full rounded-tile border border-line bg-surface-2 px-3 text-[15px] text-fg hover:border-fg-muted/50 focus:outline-none focus-visible:border-accent";

/**
 * Create or edit a payment plan (S8-03). Everything is checked as you type with the same rules the server enforces (`PlanBody`); the price
 * is typed in the plan's own currency and stored exactly; and a live preview shows how the landing page will look with this plan on it.
 */
export function PlanEditorModal({ draft, plans, onClose, onSaved }: { draft: PlanDraft; plans: PlanDoc[]; onClose: () => void; onSaved: (message: string) => void }) {
  const { user } = useAuth();
  const isEdit = Boolean(draft.id);
  const [v, setV] = useState(draft);
  const [featuresText, setFeaturesText] = useState(draft.features.join("\n"));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const set = <K extends keyof PlanDraft>(k: K, value: PlanDraft[K]) => { setV((p) => ({ ...p, [k]: value })); setErrors((e) => ({ ...e, [k]: "" })); };

  const price = toMinorUnits(v.price, v.currency);
  const priceMinor = price.ok ? price.minor : null;
  const features = featuresText.split("\n").map((f) => f.trim()).filter(Boolean);
  const priceError = errors.price || (v.price.trim() !== "" && !price.ok ? price.error : "");
  const days = v.interval === "monthly" ? "30 days" : "365 days";

  const warnings = useMemo(() => planWarnings({ id: v.id, name: v.name, interval: v.interval, currency: v.currency, priceMinor, isPublic: v.isPublic, active: v.active }, plans), [v, priceMinor, plans]);

  // The plans customers see today (active and public), this one replaced by the draft and shown as if public.
  const previewPlans = useMemo<PublicPlan[]>(() => {
    const live = plans.filter((p) => p.active && p.isPublic && p.id !== v.id).map((p) => ({ id: p.id, name: p.name, description: p.description ?? "", interval: p.interval, priceCents: p.priceCents, currency: p.currency, features: p.features, highlight: p.highlight === true, sortOrder: p.sortOrder ?? 0 }));
    if (priceMinor === null) return live;
    return [...live, { id: v.id ?? "draft", name: v.name.trim() || "Plan name", description: v.description.trim(), interval: v.interval, priceCents: priceMinor, currency: v.currency, features, highlight: v.highlight, sortOrder: Number(v.sortOrder) || 0 }];
  }, [plans, v, priceMinor, features]);

  const body = () => ({ name: v.name, description: v.description, interval: v.interval, currency: v.currency, price: v.price, features, isPublic: v.isPublic, active: v.active, highlight: v.highlight, sortOrder: Number(v.sortOrder) || 0 });

  async function save() {
    if (!user || busy) return;
    setFormError("");
    const check = PlanBody.safeParse(body());
    if (!check.success) {
      const next: Record<string, string> = {};
      for (const i of check.error.issues) next[String(i.path[0] ?? "form")] ??= i.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await fetch(isEdit ? `/api/admin/plans/${v.id}` : "/api/admin/plans", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify(body()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(data.issues) && data.issues.length) setErrors(Object.fromEntries(data.issues.map((i: { path: string; message: string }) => [i.path.split(".")[0] || "form", i.message])));
        else setFormError(data.error || "Could not save the plan. Nothing was changed.");
        return;
      }
      const live = v.active && v.isPublic;
      onSaved(`${isEdit ? "Plan saved" : "Plan created"}. ${live ? "The pricing section on the landing page now shows it." : "It is not shown on the landing page."}`);
    } catch {
      setFormError("Could not save the plan. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  const row = "flex items-start justify-between gap-4";
  return (
    <Modal onClose={onClose} ariaLabel={isEdit ? "Edit plan" : "New plan"} className="w-full max-w-6xl max-h-[92vh] overflow-y-auto bg-canvas border border-line rounded-card shadow-2xl p-5 sm:p-7">
      <div data-ui="plan-editor">
        <h2 className="text-lg font-bold text-fg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{isEdit ? "Edit plan" : "New plan"}</h2>
        <p className="text-sm text-fg-muted mt-1 mb-6">A plan is a one-time payment for a period of access. Nothing renews automatically.</p>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-5" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Plan name" id="plan-name" value={v.name} maxLength={80} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Pro" error={errors.name || undefined} autoFocus />
              <div className="flex flex-col gap-1.5">
                <span id="plan-interval-label" className="text-sm font-semibold text-fg">Billing period</span>
                <div role="radiogroup" aria-labelledby="plan-interval-label" className="grid grid-cols-2 gap-2">
                  {(["monthly", "yearly"] as const).map((iv) => (
                    <button key={iv} type="button" role="radio" aria-checked={v.interval === iv} onClick={() => set("interval", iv)}
                      className={`h-12 rounded-tile border text-[15px] font-semibold transition-colors ${v.interval === iv ? "border-accent bg-accent text-canvas" : "border-line bg-surface-2 text-fg-soft hover:text-fg"}`}>{iv === "monthly" ? "Monthly" : "Yearly"}</button>
                  ))}
                </div>
                {errors.interval && <p className="text-sm text-danger">{errors.interval}</p>}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr_0.8fr]">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="plan-currency" className="text-sm font-semibold text-fg">Currency</label>
                <select id="plan-currency" value={v.currency} onChange={(e) => { set("currency", e.target.value as PlanCurrency); }} className={select}>
                  {PLAN_CURRENCIES.map((c) => <option key={c} value={c}>{c.toUpperCase()} · {CURRENCY_NAME[c]}</option>)}
                </select>
                {errors.currency && <p className="text-sm text-danger">{errors.currency}</p>}
              </div>
              <Input label={`Price (${v.currency.toUpperCase()})`} id="plan-price" inputMode="decimal" value={v.price} onChange={(e) => set("price", e.target.value)} placeholder={v.currency === "jpy" ? "4800" : "99"} error={priceError || undefined}
                hint={priceMinor !== null ? `Customers pay ${formatMoney(priceMinor, v.currency, "en-US")} once for ${days} of access.` : undefined} />
              <Input label="Sort order" id="plan-sort" type="number" value={v.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} placeholder="0" error={errors.sortOrder || undefined} hint="Lower comes first." />
            </div>

            <Input label="Short description (optional)" id="plan-description" value={v.description} maxLength={200} onChange={(e) => set("description", e.target.value)} placeholder="e.g. For studios delivering every week" error={errors.description || undefined} />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="plan-features" className="text-sm font-semibold text-fg">Features <span className="font-normal text-fg-muted">(one per line, shown on the pricing card)</span></label>
              <textarea id="plan-features" value={featuresText} onChange={(e) => { setFeaturesText(e.target.value); setErrors((p) => ({ ...p, features: "" })); }} rows={5} placeholder={"Unlimited galleries\nUnlimited photos & videos\nPassword protection"} className={textarea} aria-invalid={errors.features ? true : undefined} aria-describedby={errors.features ? "plan-features-error" : undefined} />
              {errors.features && <p id="plan-features-error" className="text-sm text-danger">{errors.features}</p>}
            </div>

            <div className="space-y-4 rounded-card border border-line bg-surface p-4">
              <div className={row}>
                <div><p id="lbl-public" className="text-sm font-semibold text-fg">Show on the landing page</p><p className="text-xs text-fg-muted mt-0.5">Off: hidden from the pricing section; still reachable by its direct link and assignable.</p></div>
                <Toggle checked={v.isPublic} onChange={(x) => set("isPublic", x)} label="Show on the landing page" />
              </div>
              <div className={row}>
                <div><p className="text-sm font-semibold text-fg">Highlight as “Most popular”</p><p className="text-xs text-fg-muted mt-0.5">Gives the card the accent border.</p></div>
                <Toggle checked={v.highlight} onChange={(x) => set("highlight", x)} label="Highlight as Most popular" />
              </div>
              <div className={row}>
                <div><p className="text-sm font-semibold text-fg">Active</p><p className="text-xs text-fg-muted mt-0.5">Off retires it: it cannot be bought or assigned. People who already have it keep their access.</p></div>
                <Toggle checked={v.active} onChange={(x) => set("active", x)} label="Active" />
              </div>
            </div>

            {formError && <p role="alert" className="text-sm text-danger" data-ui="plan-form-error">{formError}</p>}
            <div className="flex gap-2 pt-1">
              <Button type="submit" loading={busy} data-ui="plan-save">{isEdit ? "Save changes" : "Create plan"}</Button>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            </div>
          </form>

          <PlanPreview plans={previewPlans} warnings={warnings} ready={priceMinor !== null} />
        </div>
      </div>
    </Modal>
  );
}
