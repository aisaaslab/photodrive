"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PlanEditorModal, emptyDraft, type PlanDraft } from "@/components/admin/PlanEditorModal";
import type { PlanDoc } from "@/lib/firestore/types";

function formatPrice(cents: number) {
  const v = cents / 100;
  return `$${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)}`;
}

export default function AdminPlansPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorDraft, setEditorDraft] = useState<PlanDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/plans", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setPlans((await res.json()).plans);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  async function togglePlanField(id: string, field: "isPublic" | "active" | "highlight", value: boolean) {
    if (!user) return;
    setBusyId(id);
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    }
    setBusyId(null);
  }

  async function deletePlan(id: string) {
    if (!user) return;
    setBusyId(id);
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/plans/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setPlans((prev) => prev.filter((p) => p.id !== id));
      setDeleteConfirm(null);
    }
    setBusyId(null);
  }

  function copyPlanLink(plan: PlanDoc) {
    const url = `${window.location.origin}/subscribe?plan=${plan.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(plan.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
            Plans
          </h1>
          <p className="text-sm text-stone-400 mt-1">
            Monthly &amp; yearly payment plans. Public plans appear on the landing-page pricing section; private plans are assign-only or reachable by direct link.
          </p>
        </div>
        <button
          onClick={() => setEditorDraft({ ...emptyDraft })}
          className="shrink-0 flex items-center gap-2 bg-[#17509e] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-[#103a75] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New plan
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="border border-dashed border-white/15 rounded-2xl py-20 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#17509e]/10 border border-[#17509e]/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-[#2dabe0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.36-1.352c1.163.204 2.293.368 3.372.52m-1.02-4.917c1.04-.166 2.09-.3 3.138-.411M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-white font-semibold mb-1" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
            No payment plans yet
          </p>
          <p className="text-sm text-stone-500 max-w-sm mx-auto">
            Create your first plan to show pricing on the landing page and to assign subscriptions to users.
            Until then, the pricing section keeps showing the default annual card.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`border rounded-2xl p-5 flex flex-col transition-colors ${
                p.highlight ? "border-[#17509e]/40 bg-[#17509e]/[0.06]" : "border-white/[0.06] bg-white/[0.03]"
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-sm truncate" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
                      {p.name}
                    </span>
                    {p.highlight && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#17509e]/20 text-[#2dabe0] border border-[#17509e]/30">
                        Popular
                      </span>
                    )}
                  </div>
                  {p.description && <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">{p.description}</p>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold text-white" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
                    {formatPrice(p.priceCents)}
                  </div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wide">{p.interval}</div>
                </div>
              </div>

              {/* Status badges */}
              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${p.isPublic ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-white/[0.04] text-stone-400 border-white/10"}`}>
                  {p.isPublic ? "Public · on pricing page" : "Private"}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${p.active ? "bg-[#17509e]/10 text-[#2dabe0] border-[#17509e]/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
                  {p.active ? "Active" : "Inactive"}
                </span>
              </div>

              {/* Features */}
              {p.features.length > 0 && (
                <ul className="mt-4 space-y-1.5 flex-1">
                  {p.features.slice(0, 4).map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-stone-400">
                      <svg className="w-3 h-3 text-[#2dabe0] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      <span className="line-clamp-1">{f}</span>
                    </li>
                  ))}
                  {p.features.length > 4 && (
                    <li className="text-xs text-stone-600 pl-5">+{p.features.length - 4} more</li>
                  )}
                </ul>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1.5 mt-5 pt-4 border-t border-white/[0.06]">
                <button
                  onClick={() => setEditorDraft({
                    id: p.id,
                    name: p.name,
                    description: p.description ?? "",
                    interval: p.interval,
                    price: String(p.priceCents / 100),
                    features: p.features,
                    isPublic: p.isPublic,
                    active: p.active,
                    highlight: p.highlight === true,
                    sortOrder: String(p.sortOrder ?? 0),
                  })}
                  className="flex-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white/[0.06] border border-white/10 text-stone-300 hover:text-white hover:border-white/20 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => togglePlanField(p.id, "isPublic", !p.isPublic)}
                  disabled={busyId === p.id}
                  className="flex-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white/[0.06] border border-white/10 text-stone-300 hover:text-white hover:border-white/20 disabled:opacity-50 transition-colors"
                >
                  {p.isPublic ? "Make private" : "Make public"}
                </button>
                <button
                  onClick={() => copyPlanLink(p)}
                  className="p-1.5 border border-white/10 rounded-lg text-stone-400 hover:text-white hover:border-white/20 transition-colors"
                  title="Copy direct subscribe link"
                >
                  {copiedId === p.id ? (
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.678l1.586-1.586a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => togglePlanField(p.id, "active", !p.active)}
                  disabled={busyId === p.id}
                  className="p-1.5 border border-white/10 rounded-lg text-stone-400 hover:text-white hover:border-white/20 disabled:opacity-50 transition-colors"
                  title={p.active ? "Deactivate plan" : "Activate plan"}
                >
                  {p.active ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                    </svg>
                  )}
                </button>
                {deleteConfirm === p.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => deletePlan(p.id)}
                      disabled={busyId === p.id}
                      className="px-2 py-1 bg-red-500/10 border border-red-500/30 text-red-400 text-[11px] rounded-lg hover:bg-red-500/20 disabled:opacity-50"
                    >
                      {busyId === p.id ? "..." : "Delete"}
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-2 py-1 border border-white/10 text-stone-400 text-[11px] rounded-lg"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(p.id)}
                    className="p-1.5 border border-white/10 rounded-lg text-stone-400 hover:text-red-400 hover:border-red-500/30 transition-colors"
                    title="Delete plan"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editorDraft && (
        <PlanEditorModal
          draft={editorDraft}
          onClose={() => setEditorDraft(null)}
          onSaved={() => {
            setEditorDraft(null);
            loadPlans();
          }}
        />
      )}
    </div>
  );
}
