"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PlanEditorModal, emptyDraft, type PlanDraft } from "@/components/admin/PlanEditorModal";
import type { PlanDoc } from "@/lib/firestore/types";
import { formatMoney } from "@/lib/shared/money";
import { isPlanCurrency, toMajorString } from "@/lib/shared/plan-input";

const price = (p: Pick<PlanDoc, "priceCents" | "currency">) => formatMoney(p.priceCents, p.currency, "en-US", { trimWholeNumbers: true });
const smallBtn = "h-8 px-3 text-xs";

/** Plans (S8-03): what customers can buy, grouped by whether the landing page shows it, each in its own currency. Every change expires the cached pricing, so the landing page updates on its next view, and is recorded under your name. */
export default function AdminPlansPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [plans, setPlans] = useState<PlanDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PlanDoc | null>(null);

  const auth = useCallback(async () => ({ "Content-Type": "application/json", Authorization: `Bearer ${await user!.getIdToken()}` }), [user]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/admin/plans", { headers: await auth() });
      if (!res.ok) throw new Error(String(res.status));
      setPlans((await res.json()).plans); setLoadError(false);
    } catch { setLoadError(true); } finally { setLoading(false); }
  }, [user, auth]);
  useEffect(() => { void load(); }, [load]);

  async function toggle(p: PlanDoc, field: "isPublic" | "active", value: boolean) {
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/admin/plans/${p.id}`, { method: "PATCH", headers: await auth(), body: JSON.stringify({ [field]: value }) });
      if (!res.ok) { toast((await res.json().catch(() => ({}))).error || "That did not work. Nothing was changed.", "error"); return; }
      setPlans((prev) => prev.map((x) => (x.id === p.id ? { ...x, [field]: value } : x)));
      toast(field === "isPublic" ? (value ? `“${p.name}” is now shown on the landing page.` : `“${p.name}” is now hidden from the landing page.`) : value ? `“${p.name}” is active again.` : `“${p.name}” is deactivated.`);
    } catch { toast("That did not work. Nothing was changed.", "error"); } finally { setBusyId(null); }
  }

  async function remove(p: PlanDoc) {
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/admin/plans/${p.id}`, { method: "DELETE", headers: await auth() });
      if (!res.ok) { toast((await res.json().catch(() => ({}))).error || "That did not work. Nothing was changed.", "error"); return; }
      setPlans((prev) => prev.filter((x) => x.id !== p.id));
      setConfirmDelete(null);
      toast(`“${p.name}” was deleted.`);
    } catch { toast("That did not work. Nothing was changed.", "error"); } finally { setBusyId(null); }
  }

  function copyLink(p: PlanDoc) {
    navigator.clipboard.writeText(`${window.location.origin}/subscribe?plan=${p.id}`).then(() => toast("Direct link copied."), () => toast("Could not copy the link.", "error"));
  }

  function edit(p: PlanDoc) {
    if (!isPlanCurrency(p.currency)) { toast(`This plan is priced in ${p.currency.toUpperCase()}, which this screen cannot edit. Create a new plan instead.`, "error"); return; }
    setDraft({ id: p.id, name: p.name, description: p.description ?? "", interval: p.interval, currency: p.currency, price: toMajorString(p.priceCents, p.currency), features: p.features, isPublic: p.isPublic, active: p.active, highlight: p.highlight === true, sortOrder: String(p.sortOrder ?? 0) });
  }

  if (loading) return <div className="flex items-center justify-center py-32"><div className="w-5 h-5 border-2 border-fg-muted/30 border-t-fg rounded-full animate-spin" /></div>;

  const onPage = plans.filter((p) => p.active && p.isPublic);
  const hidden = plans.filter((p) => !(p.active && p.isPublic));

  const card = (p: PlanDoc) => (
    <li key={p.id} data-ui="plan-card" data-plan={p.name} className="flex flex-col rounded-card border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-fg truncate">{p.name}</h3>
          <p className="text-xs text-fg-muted mt-0.5">{p.interval === "monthly" ? "Monthly · 30 days of access" : "Yearly · 365 days of access"}</p>
        </div>
        {p.highlight && <Badge>Most popular</Badge>}
      </div>
      <p className="mt-4 flex items-baseline gap-1.5"><span data-ui="plan-price" className="text-3xl font-extrabold tracking-tight text-fg tabular-nums">{price(p)}</span><span className="text-sm text-fg-muted">/ {p.interval === "monthly" ? "month" : "year"} · {p.currency.toUpperCase()}</span></p>
      {p.description && <p className="mt-2 text-sm text-fg-muted">{p.description}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone={p.isPublic ? "success" : "neutral"}>{p.isPublic ? "Public" : "Private"}</Badge>
        <Badge tone={p.active ? "success" : "danger"}>{p.active ? "Active" : "Inactive"}</Badge>
      </div>
      {p.features.length > 0 && (
        <ul className="mt-4 space-y-1.5 flex-1">
          {p.features.slice(0, 4).map((f) => <li key={f} className="text-xs text-fg-muted flex gap-2"><span aria-hidden className="text-accent">✓</span><span className="line-clamp-1">{f}</span></li>)}
          {p.features.length > 4 && <li className="text-xs text-fg-muted pl-5">+{p.features.length - 4} more</li>}
        </ul>
      )}
      <div className="mt-5 pt-4 border-t border-line flex flex-wrap gap-1.5">
        <Button variant="outline" className={smallBtn} onClick={() => edit(p)} data-ui="plan-edit">Edit</Button>
        <Button variant="outline" className={smallBtn} disabled={busyId === p.id} onClick={() => toggle(p, "isPublic", !p.isPublic)} data-ui="plan-visibility">{p.isPublic ? "Hide from landing page" : "Show on landing page"}</Button>
        <Button variant="outline" className={smallBtn} disabled={busyId === p.id} onClick={() => toggle(p, "active", !p.active)} data-ui="plan-active">{p.active ? "Deactivate" : "Activate"}</Button>
        <Button variant="ghost" className={smallBtn} onClick={() => copyLink(p)}>Copy direct link</Button>
        <Button variant="ghost" className={`${smallBtn} text-danger`} onClick={() => setConfirmDelete(p)} data-ui="plan-delete">Delete</Button>
      </div>
    </li>
  );

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-fg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>Plans</h1>
          <p className="text-sm text-fg-muted mt-1" data-ui="plans-summary">{onPage.length === 0 ? "Customers see no plan on the landing page." : `Customers see ${onPage.length} plan${onPage.length === 1 ? "" : "s"} on the landing page.`} Each plan is a one-time payment, priced in its own currency.</p>
        </div>
        <Button size="sm" onClick={() => setDraft({ ...emptyDraft })} data-ui="plan-new">New plan</Button>
      </div>

      {loadError && <p role="alert" className="mb-4 text-sm text-danger">Could not load the plans. <button type="button" className="underline" onClick={() => void load()}>Retry</button></p>}

      <section aria-labelledby="plans-live" className="mb-8">
        <h2 id="plans-live" className="text-xs font-semibold tracking-wide uppercase text-fg-muted mb-3">On the landing page</h2>
        {onPage.length === 0 ? <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-sm text-fg-muted">No public, active plan. The pricing section shows a generic card with no price until you add one.</p>
          : <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{onPage.map(card)}</ul>}
      </section>

      {hidden.length > 0 && (
        <section aria-labelledby="plans-hidden">
          <h2 id="plans-hidden" className="text-xs font-semibold tracking-wide uppercase text-fg-muted mb-3">Not on the landing page</h2>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{hidden.map(card)}</ul>
        </section>
      )}

      {draft && <PlanEditorModal draft={draft} plans={plans} onClose={() => setDraft(null)} onSaved={(m) => { setDraft(null); toast(m); void load(); }} />}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} ariaLabel="Delete plan" className="bg-canvas border border-line rounded-card shadow-2xl w-full max-w-md p-6">
          <div data-ui="plan-delete-confirm">
            <h2 className="font-bold text-fg">Delete “{confirmDelete.name}”?</h2>
            <p className="mt-2 text-sm text-fg-muted">It disappears from the landing page and checkout at once. People who already have it keep their access and its name on their account. This cannot be undone; to just hide it, deactivate it instead.</p>
            <div className="mt-5 flex gap-2">
              <Button variant="danger" size="sm" loading={busyId === confirmDelete.id} onClick={() => remove(confirmDelete)} data-ui="plan-delete-yes">Yes, delete</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
