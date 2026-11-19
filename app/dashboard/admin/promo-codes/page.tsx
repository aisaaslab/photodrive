"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

type Rule = { code: string; accessDays: number; note: string; active: boolean; createdAt: number; redemptions: number };
type Unmanaged = { code: string; redemptions: number };

const PRESETS: [number, string][] = [
  [30, "1 month"],
  [90, "3 months"],
  [180, "6 months"],
  [365, "1 year"],
  [730, "2 years"],
];

/** 365 → "1 year", 90 → "3 months", 45 → "45 days". */
function humanDays(days: number) {
  if (days % 365 === 0) return `${days / 365} year${days === 365 ? "" : "s"}`;
  if (days % 30 === 0) return `${days / 30} month${days === 30 ? "" : "s"}`;
  return `${days} day${days === 1 ? "" : "s"}`;
}

const input =
  "bg-[#111111] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-white/20";

export default function AdminPromoCodesPage() {
  const { user } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [unmanaged, setUnmanaged] = useState<Unmanaged[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // New-rule form
  const [code, setCode] = useState("");
  const [days, setDays] = useState("365");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);

  // Inline edit of a rule's length
  const [editing, setEditing] = useState<string | null>(null);
  const [editDays, setEditDays] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/promo-codes", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setRules(data.rules);
      setUnmanaged(data.unmanaged);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function call(path: string, method: string, body?: unknown): Promise<string | null> {
    if (!user) return "Not signed in";
    const token = await user.getIdToken();
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return null;
    return (await res.json().catch(() => ({}))).error ?? "Something went wrong.";
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    const err = await call("/api/admin/promo-codes", "POST", { code, accessDays: Number(days), note });
    setCreating(false);
    if (err) { setError(err); return; }
    setCode(""); setNote("");
    load();
  }

  async function patch(rule: Rule, body: Record<string, unknown>) {
    setBusy(rule.code);
    setError("");
    const err = await call(`/api/admin/promo-codes/${encodeURIComponent(rule.code)}`, "PATCH", body);
    setBusy(null);
    if (err) { setError(err); return false; }
    await load();
    return true;
  }

  async function remove(rule: Rule) {
    setBusy(rule.code);
    const err = await call(`/api/admin/promo-codes/${encodeURIComponent(rule.code)}`, "DELETE");
    setBusy(null);
    setDeleteConfirm(null);
    if (err) setError(err);
    else load();
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          Promo codes
        </h1>
        <p className="text-sm text-stone-400 mt-1 max-w-2xl">
          Choose how long a free (100%-off) code gives access. Create the code itself in Stripe, then add it here with its length.
          Without a rule, a free code gives the length of whichever plan the person picked (30 days for monthly, 1 year for yearly).
        </p>
      </div>

      {/* New rule */}
      <form onSubmit={create} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 mb-6">
        <p className="text-sm font-semibold text-white mb-3">Add a free code</p>
        <div className="flex flex-wrap gap-3 items-start">
          <div>
            <label className="block text-xs text-stone-400 mb-1" htmlFor="pc-code">Code (as entered at checkout)</label>
            <input id="pc-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="FREEYEAR" maxLength={40} required className={`${input} font-mono w-52`} />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1" htmlFor="pc-days">Access length (days)</label>
            <input id="pc-days" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} required className={`${input} w-36`} />
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {PRESETS.map(([d, label]) => (
                <button key={d} type="button" onClick={() => setDays(String(d))}
                  className={`text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors ${days === String(d) ? "bg-white text-stone-900 border-white" : "text-stone-400 border-white/10 hover:text-white hover:border-white/25"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-xs text-stone-400 mb-1" htmlFor="pc-note">Note (optional, only you see it)</label>
            <input id="pc-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Beta testers, Nov 2026" maxLength={200} className={`${input} w-full`} />
          </div>
          <button type="submit" disabled={creating || !code.trim()}
            className="self-end bg-[#17509e] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-[#103a75] disabled:opacity-50 transition-colors">
            {creating ? "Adding…" : "Add code"}
          </button>
        </div>
      </form>

      {error && <p role="alert" className="text-sm text-red-400 mb-4">{error}</p>}

      {/* Codes already redeemed that have no rule yet */}
      {unmanaged.length > 0 && (
        <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-2xl p-4 mb-6">
          <p className="text-sm font-semibold text-amber-200">Redeemed without a rule</p>
          <p className="text-xs text-stone-400 mt-0.5 mb-3">These codes were used for free signups but have no length set, so they gave the chosen plan&apos;s period. Add a rule to fix future redemptions.</p>
          <div className="flex flex-wrap gap-2">
            {unmanaged.map((u) => (
              <button key={u.code} type="button" onClick={() => { setCode(u.code); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="text-xs font-mono px-3 py-1.5 rounded-full border border-amber-500/30 text-amber-200 hover:bg-amber-500/10 transition-colors">
                {u.code} <span className="text-stone-400 font-sans">· {u.redemptions} used</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rules */}
      {rules.length === 0 ? (
        <div className="border border-dashed border-white/15 rounded-2xl py-14 text-center text-sm text-stone-500">
          No rules yet. Add your first free code above.
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((r) => (
            <div key={r.code} className={`border rounded-2xl px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-3 ${r.active ? "bg-white/[0.03] border-white/[0.06]" : "bg-white/[0.01] border-white/[0.04] opacity-60"}`}>
              <div className="min-w-[9rem]">
                <p className="font-mono text-sm font-semibold text-white">{r.code}</p>
                {r.note && <p className="text-xs text-stone-500 mt-0.5">{r.note}</p>}
              </div>

              <div className="min-w-[9rem]">
                {editing === r.code ? (
                  <span className="flex items-center gap-1.5">
                    <input aria-label="Access length in days" type="number" min={1} max={3650} value={editDays} onChange={(e) => setEditDays(e.target.value)} className={`${input} w-24 py-1.5`} />
                    <button onClick={async () => { if (await patch(r, { accessDays: Number(editDays) })) setEditing(null); }} disabled={busy === r.code}
                      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-[#17509e] text-white hover:bg-[#103a75] disabled:opacity-50">Save</button>
                    <button onClick={() => setEditing(null)} className="text-xs px-2 py-1.5 text-stone-400 hover:text-white">Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => { setEditing(r.code); setEditDays(String(r.accessDays)); }} title="Change length"
                    className="text-sm text-white hover:text-[#2dabe0] transition-colors text-left">
                    <span className="font-semibold">{humanDays(r.accessDays)}</span>
                    <span className="text-xs text-stone-500"> · {r.accessDays} days ✎</span>
                  </button>
                )}
              </div>

              <p className="text-xs text-stone-400">{r.redemptions} redemption{r.redemptions === 1 ? "" : "s"}</p>

              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => patch(r, { active: !r.active })} disabled={busy === r.code}
                  title={r.active ? "Stop applying this length (falls back to the plan's length)" : "Apply this length again"}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${r.active ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" : "border-white/10 text-stone-400 hover:text-white"}`}>
                  {r.active ? "Active" : "Off"}
                </button>
                {deleteConfirm === r.code ? (
                  <span className="flex items-center gap-1.5">
                    <button onClick={() => remove(r)} disabled={busy === r.code} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 disabled:opacity-50">Delete</button>
                    <button onClick={() => setDeleteConfirm(null)} className="text-xs px-2 py-1.5 text-stone-400">No</button>
                  </span>
                ) : (
                  <button onClick={() => setDeleteConfirm(r.code)} aria-label={`Delete ${r.code}`} className="text-stone-500 hover:text-red-400 transition-colors p-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-stone-500 mt-6 max-w-2xl">
        Changes apply to future redemptions only; people who already signed up keep what they were given (adjust them on the Users tab).
        Prefer to keep it in Stripe? Add <span className="font-mono text-stone-400">access_days</span> (e.g. 365) to the promotion code&apos;s metadata. A rule here takes priority over it.
      </p>
    </div>
  );
}
