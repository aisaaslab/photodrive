"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { CODE_RE, MAX_ACCESS_DAYS, humanDays, normalizeCode, validAccessDays } from "@/lib/shared/promo";

type Rule = { code: string; accessDays: number; note: string; active: boolean; createdAt: number; redemptions: number };
type Unmanaged = { code: string; redemptions: number };
const PRESETS: [number, string][] = [[30, "1 month"], [90, "3 months"], [180, "6 months"], [365, "1 year"], [730, "2 years"]];

/** Promo codes (S8-03): how long each free (100%-off) Stripe code grants access. Checked as you type with the server's own rules; every change is recorded under your name and applies to future redemptions only. */
export default function AdminPromoCodesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [unmanaged, setUnmanaged] = useState<Unmanaged[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Rule | null>(null);

  const [code, setCode] = useState("");
  const [days, setDays] = useState("365");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState("");

  const [editing, setEditing] = useState<string | null>(null);
  const [editDays, setEditDays] = useState("");
  const [editNote, setEditNote] = useState("");

  const auth = useCallback(async () => ({ "Content-Type": "application/json", Authorization: `Bearer ${await user!.getIdToken()}` }), [user]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/admin/promo-codes", { headers: await auth() });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      setRules(d.rules); setUnmanaged(d.unmanaged); setLoadError(false);
    } catch { setLoadError(true); } finally { setLoading(false); }
  }, [user, auth]);
  useEffect(() => { void load(); }, [load]);

  const tidy = normalizeCode(code);
  const codeError = !tidy ? (touched ? "Enter the code as customers type it at checkout." : "") : !CODE_RE.test(tidy) ? "Use 2–40 letters, numbers, - or _." : rules.some((r) => r.code === tidy) ? "A rule for this code already exists. Edit it below." : "";
  const daysError = validAccessDays(days) === null ? `Access length must be a whole number of days from 1 to ${MAX_ACCESS_DAYS}.` : "";

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true); setServerError("");
    if (!tidy || codeError || daysError) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/promo-codes", { method: "POST", headers: await auth(), body: JSON.stringify({ code: tidy, accessDays: Number(days), note }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setServerError(d.issues?.[0]?.message || d.error || "That did not work. Nothing was changed."); return; }
      toast(`Rule added: ${tidy} gives ${humanDays(Number(days))}.`);
      setCode(""); setNote(""); setTouched(false);
      await load();
    } catch { setServerError("That did not work. Nothing was changed."); } finally { setCreating(false); }
  }

  async function patch(r: Rule, body: Record<string, unknown>, done: string): Promise<boolean> {
    setBusy(r.code);
    try {
      const res = await fetch(`/api/admin/promo-codes/${encodeURIComponent(r.code)}`, { method: "PATCH", headers: await auth(), body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast(d.issues?.[0]?.message || d.error || "That did not work. Nothing was changed.", "error"); return false; }
      toast(d.changed === false ? "Nothing to change." : done);
      await load();
      return true;
    } catch { toast("That did not work. Nothing was changed.", "error"); return false; } finally { setBusy(null); }
  }

  async function remove(r: Rule) {
    setBusy(r.code);
    try {
      const res = await fetch(`/api/admin/promo-codes/${encodeURIComponent(r.code)}`, { method: "DELETE", headers: await auth() });
      if (!res.ok) { toast((await res.json().catch(() => ({}))).error || "That did not work. Nothing was changed.", "error"); return; }
      setConfirmDelete(null); toast(`Rule ${r.code} deleted.`); await load();
    } catch { toast("That did not work. Nothing was changed.", "error"); } finally { setBusy(null); }
  }

  if (loading) return <div className="flex items-center justify-center py-32"><div className="w-5 h-5 border-2 border-fg-muted/30 border-t-fg rounded-full animate-spin" /></div>;

  const editDaysError = editing && validAccessDays(editDays) === null ? `1 to ${MAX_ACCESS_DAYS} days.` : "";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>Promo codes</h1>
        <p className="text-sm text-fg-muted mt-1 max-w-2xl">
          Choose how long a free (100%-off) code gives access. Create the code itself in Stripe, then add it here with its length. Without a rule, a free code gives the length of whichever plan the person picked (30 days for monthly, 365 days for yearly).
        </p>
      </div>

      {loadError && <p role="alert" className="mb-4 text-sm text-danger">Could not load the codes. <button type="button" className="underline" onClick={() => void load()}>Retry</button></p>}

      <form onSubmit={create} noValidate className="bg-surface border border-line rounded-card p-5 mb-6" data-ui="promo-form">
        <h2 className="text-sm font-semibold text-fg mb-3">Add a free code</h2>
        <div className="grid gap-4 md:grid-cols-[1fr_auto_2fr]">
          <Input label="Code (as typed at checkout)" id="pc-code" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setServerError(""); }} placeholder="FREEYEAR" maxLength={40} className="font-mono" error={codeError || undefined} />
          <div className="flex flex-col gap-1.5">
            <Input label="Access length (days)" id="pc-days" type="number" min={1} max={MAX_ACCESS_DAYS} value={days} onChange={(e) => setDays(e.target.value)} className="md:w-40" error={daysError || undefined} hint={!daysError ? humanDays(Number(days)) : undefined} />
            <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Common lengths">
              {PRESETS.map(([d, label]) => (
                <button key={d} type="button" onClick={() => setDays(String(d))} aria-pressed={days === String(d)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-pill border transition-colors ${days === String(d) ? "bg-accent text-canvas border-accent" : "text-fg-muted border-line hover:text-fg"}`}>{label}</button>
              ))}
            </div>
          </div>
          <Input label="Note (optional, only you see it)" id="pc-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Beta testers, Nov 2026" maxLength={200} />
        </div>
        {serverError && <p role="alert" className="mt-3 text-sm text-danger" data-ui="promo-error">{serverError}</p>}
        <div className="mt-4"><Button type="submit" size="sm" loading={creating} data-ui="promo-add">Add code</Button></div>
      </form>

      {unmanaged.length > 0 && (
        <section aria-labelledby="unmanaged-title" className="bg-amber-500/[0.06] border border-amber-500/20 rounded-card p-4 mb-6" data-ui="promo-unmanaged">
          <h2 id="unmanaged-title" className="text-sm font-semibold text-amber-200">Redeemed without a rule</h2>
          <p className="text-xs text-fg-muted mt-0.5 mb-3">These codes were used for free signups but have no length set, so they gave the chosen plan&apos;s period. Add a rule to fix future redemptions.</p>
          <div className="flex flex-wrap gap-2">
            {unmanaged.map((u) => (
              <button key={u.code} type="button" onClick={() => { setCode(u.code); setTouched(false); document.getElementById("pc-code")?.focus(); }} className="text-xs font-mono px-3 py-1.5 rounded-full border border-amber-500/30 text-amber-200 hover:bg-amber-500/10 transition-colors">
                {u.code} <span className="text-fg-muted font-sans">· {u.redemptions} used</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {rules.length === 0 ? (
        <div className="border border-dashed border-line rounded-card py-14 text-center text-sm text-fg-muted">No rules yet. Add your first free code above.</div>
      ) : (
        <ul className="space-y-3" data-ui="promo-rules">
          {rules.map((r) => (
            <li key={r.code} data-ui="promo-rule" data-code={r.code} className="border border-line rounded-card px-5 py-4 bg-surface">
              {editing === r.code ? (
                <form onSubmit={async (e) => { e.preventDefault(); if (editDaysError) return; if (await patch(r, { accessDays: Number(editDays), note: editNote }, `${r.code} now gives ${humanDays(Number(editDays))}.`)) setEditing(null); }} className="grid gap-3 md:grid-cols-[auto_8rem_1fr_auto] items-start" noValidate>
                  <p className="font-mono text-sm font-semibold text-fg pt-3">{r.code}</p>
                  <Input label="Days" id={`edit-days-${r.code}`} type="number" min={1} max={MAX_ACCESS_DAYS} value={editDays} onChange={(e) => setEditDays(e.target.value)} error={editDaysError || undefined} />
                  <Input label="Note" id={`edit-note-${r.code}`} value={editNote} onChange={(e) => setEditNote(e.target.value)} maxLength={200} />
                  <div className="flex gap-2 md:pt-7"><Button type="submit" size="sm" loading={busy === r.code} data-ui="promo-save">Save</Button><Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button></div>
                </form>
              ) : (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="min-w-[9rem]">
                    <p className="font-mono text-sm font-semibold text-fg">{r.code}</p>
                    {r.note && <p className="text-xs text-fg-muted mt-0.5">{r.note}</p>}
                  </div>
                  <p className="text-sm text-fg min-w-[9rem]"><span className="font-semibold">{humanDays(r.accessDays)}</span><span className="text-xs text-fg-muted"> · {r.accessDays} days</span></p>
                  <p className="text-xs text-fg-muted" data-ui="promo-redemptions">{r.redemptions} redemption{r.redemptions === 1 ? "" : "s"}</p>
                  <div className="ml-auto flex items-center gap-3">
                    <span className="flex items-center gap-2 text-xs text-fg-muted">
                      <Toggle checked={r.active} disabled={busy === r.code} label={`${r.code} is applied at checkout`} onChange={(x) => void patch(r, { active: x }, x ? `${r.code} is applied again.` : `${r.code} is off: free signups with it get the plan's length.`)} />
                      {r.active ? "On" : "Off"}
                    </span>
                    <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => { setEditing(r.code); setEditDays(String(r.accessDays)); setEditNote(r.note); }} data-ui="promo-edit">Edit</Button>
                    <Button variant="ghost" className="h-8 px-3 text-xs text-danger" onClick={() => setConfirmDelete(r)} aria-label={`Delete ${r.code}`} data-ui="promo-delete">Delete</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-fg-muted mt-6 max-w-2xl">
        Changes apply to future redemptions only; people who already signed up keep what they were given (adjust them on the Users tab). Prefer to keep it in Stripe? Add <span className="font-mono">access_days</span> (e.g. 365) to the promotion code&apos;s metadata. A rule here takes priority over it.
      </p>

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} ariaLabel="Delete rule" className="bg-canvas border border-line rounded-card shadow-2xl w-full max-w-md p-6">
          <div data-ui="promo-delete-confirm">
            <h2 className="font-bold text-fg">Delete the rule for <span className="font-mono">{confirmDelete.code}</span>?</h2>
            <p className="mt-2 text-sm text-fg-muted">Free signups with this code will get the length of the plan they pick instead. People who already used it keep their access. To pause it, turn it off instead.</p>
            <div className="mt-5 flex gap-2"><Button variant="danger" size="sm" loading={busy === confirmDelete.code} onClick={() => remove(confirmDelete)} data-ui="promo-delete-yes">Yes, delete</Button><Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
