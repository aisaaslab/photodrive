"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, FolderOpen, Pencil, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatMoney } from "@/lib/shared/money";
import type { PlanDoc } from "@/lib/firestore/types";
import type { AdminUserDetail, AdminUserRow } from "@/lib/server/repos/admin-users";
import { Avatar, SOURCE_LABEL, StateBadge, accessState, flagLabel, flagStyle, formatDate, formatPaid, LIFETIME_FROM } from "./admin-format";
import { GalleryEditForm } from "./GalleryEditForm";

export type PlanLite = Pick<PlanDoc, "id" | "name" | "interval" | "priceCents" | "currency" | "active" | "isPublic">;
type Action = "assign_plan" | "grant_lifetime" | "grant_year" | "revoke";

const DONE: Record<Action, string> = {
  assign_plan: "Plan assigned. The subscription is now active.",
  grant_lifetime: "Lifetime access granted.",
  grant_year: "One more year of access granted.",
  revoke: "Access revoked. The account is kept.",
};
const ACTION_LABEL: Record<string, string> = {
  "subscription.assign_plan": "Plan assigned", "subscription.grant_lifetime": "Lifetime access granted", "subscription.grant_year": "+1 year granted", "subscription.revoke": "Access revoked",
  "user.create": "Account created", "gallery.update": "Gallery edited", "gallery.delete": "Gallery deleted",
};
const section = "px-5 py-5 border-b border-line";
const h3 = "text-xs font-semibold tracking-wide uppercase text-fg-muted mb-3";
const iconBtn = "p-1.5 border border-line rounded-lg text-fg-muted hover:text-fg hover:border-fg-muted/40 transition-colors";

/** The detail drawer of a user (S7-05): access, payments, galleries, what administrators did, and the actions. Every action goes through an audited admin endpoint. */
export function UserDrawer({ uid, plans, onClose, onChanged, onDeleted }: { uid: string; plans: PlanLite[]; onClose: () => void; onChanged: (row: AdminUserRow) => void; onDeleted: (uid: string) => void }) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [planId, setPlanId] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [galleryDelete, setGalleryDelete] = useState<string | null>(null);

  const headers = useCallback(async () => ({ "Content-Type": "application/json", Authorization: `Bearer ${await user!.getIdToken()}` }), [user]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}`, { headers: await headers() });
      if (!res.ok) { setError(res.status === 404 ? "This user no longer exists." : "Could not load this user."); return; }
      const d: AdminUserDetail = await res.json();
      setDetail(d); setError("");
      onChanged(d.row);
    } catch { setError("Could not load this user."); }
  }, [user, uid, headers, onChanged]);
  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, user]);

  const act = async (action: Action) => {
    setBusy(action); setMessage(null);
    try {
      const res = await fetch("/api/admin/subscription", { method: "POST", headers: await headers(), body: JSON.stringify({ uid, action, planId: action === "assign_plan" ? planId : undefined }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ kind: "error", text: data.error || "That did not work. Please try again." }); return; }
      setMessage({ kind: "ok", text: DONE[action] }); setConfirmRevoke(false);
      await load();
    } catch { setMessage({ kind: "error", text: "That did not work. Please try again." }); } finally { setBusy(null); }
  };

  const markReviewed = async (sessionId: string) => {
    const res = await fetch("/api/admin/review", { method: "POST", headers: await headers(), body: JSON.stringify({ kind: "payment", id: sessionId }) });
    if (res.ok || res.status === 409) await load();
  };

  const deleteUser = async () => {
    setBusy("delete"); setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}`, { method: "DELETE", headers: await headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ kind: "error", text: data.error || "Could not delete the user." }); return; }
      onDeleted(uid);
    } catch { setMessage({ kind: "error", text: "Could not delete the user." }); } finally { setBusy(null); }
  };

  const deleteGallery = async (id: string) => {
    setBusy(`g-${id}`);
    try {
      const res = await fetch(`/api/admin/galleries/${id}`, { method: "DELETE", headers: await headers() });
      if (res.ok) { setGalleryDelete(null); await load(); } else setMessage({ kind: "error", text: "Could not delete the gallery." });
    } finally { setBusy(null); }
  };

  const row = detail?.row;
  const state = row ? accessState(row) : null;
  const emailMatches = !!row && deleteTyped.trim().toLowerCase() === row.email.toLowerCase();

  return (
    <Modal onClose={onClose} ariaLabel={row ? `User ${row.displayName || row.email}` : "User details"} align="end" className="w-full max-w-[560px] bg-canvas border-l border-line overflow-y-auto shadow-2xl">
      <div data-ui="user-drawer">
        <div className="sticky top-0 z-10 flex items-start gap-3 px-5 py-4 bg-canvas/95 backdrop-blur border-b border-line">
          {row ? <Avatar src={row.photoURL} name={row.displayName || row.email} size={44} /> : <div className="size-11 rounded-full bg-surface-2 animate-pulse" />}
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-fg truncate" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{row ? row.displayName || "—" : "Loading…"}</h2>
            <p className="text-sm text-fg-muted truncate">{row?.email}</p>
            {row && state && <div className="mt-2 flex items-center gap-2 flex-wrap"><StateBadge state={state} /><span className="text-xs text-fg-muted">{state.detail}</span></div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={iconBtn}><X className="size-4" aria-hidden /></button>
        </div>

        {error && <p role="alert" className="px-5 py-8 text-sm text-danger">{error}</p>}
        {!detail && !error && <div className="px-5 py-10 flex justify-center"><div className="size-5 border-2 border-fg-muted/30 border-t-fg rounded-full animate-spin" /></div>}

        {detail && row && (
          <>
            <section className={section} aria-labelledby="ud-access">
              <h3 id="ud-access" className={h3}>Access</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
                <div><dt className="text-xs text-fg-muted">Plan</dt><dd className="text-fg">{row.planName ? `${row.planName}${row.planInterval ? ` (${row.planInterval})` : ""}` : "—"}</dd></div>
                <div><dt className="text-xs text-fg-muted">Ends</dt><dd className="text-fg">{row.subscriptionExpiresAt ? (row.subscriptionExpiresAt > LIFETIME_FROM ? "Lifetime" : formatDate(row.subscriptionExpiresAt)) : "—"}</dd></div>
                <div><dt className="text-xs text-fg-muted">How they got access</dt><dd className="text-fg">{row.accessSource ? SOURCE_LABEL[row.accessSource] : "—"}{row.accessSource === "free_code" && row.promoCode ? <> · <span className="font-mono text-amber-300">{row.promoCode}</span></> : null}</dd></div>
                <div><dt className="text-xs text-fg-muted">Last payment</dt><dd className="text-fg">{formatPaid(row.lastPaymentCents, row.lastPaymentCurrency)}</dd></div>
                <div><dt className="text-xs text-fg-muted">Joined</dt><dd className="text-fg">{formatDate(row.createdAt)}</dd></div>
                <div><dt className="text-xs text-fg-muted">Last sign-in</dt><dd className="text-fg">{formatDate(row.lastSignIn)}</dd></div>
              </dl>
              <div className="flex items-center gap-2 flex-wrap">
                <label htmlFor="ud-plan" className="sr-only">Plan to assign</label>
                <select id="ud-plan" value={planId} onChange={(e) => setPlanId(e.target.value)} className="min-w-0 flex-1 bg-surface border border-line rounded-lg px-2.5 py-2 text-sm text-fg">
                  <option value="">Choose a plan…</option>
                  {plans.map((p) => <option key={p.id} value={p.id} disabled={!p.active}>{p.name} · {p.interval} · {formatMoney(p.priceCents, p.currency, "en-US")}{p.active ? "" : " (inactive)"}</option>)}
                </select>
                <Button size="sm" disabled={!planId || !!busy} loading={busy === "assign_plan"} onClick={() => act("assign_plan")}>Assign plan</Button>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" disabled={!!busy} loading={busy === "grant_year"} onClick={() => act("grant_year")} title="Adds a year on top of the current end date">+1 year</Button>
                <Button size="sm" variant="outline" disabled={!!busy} loading={busy === "grant_lifetime"} onClick={() => act("grant_lifetime")}>Free lifetime</Button>
                {confirmRevoke ? (
                  <span className="flex items-center gap-2"><span className="text-xs text-danger">Remove access?</span>
                    <Button size="sm" variant="danger" loading={busy === "revoke"} disabled={!!busy} onClick={() => act("revoke")}>Yes, revoke</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmRevoke(false)}>No</Button></span>
                ) : <Button size="sm" variant="danger" disabled={!!busy} onClick={() => setConfirmRevoke(true)}>Revoke access</Button>}
              </div>
              <p className="text-xs text-fg-muted mt-3">Revoking removes premium access and keeps the account and its galleries.</p>
              <div aria-live="polite">{message && <p role={message.kind === "error" ? "alert" : "status"} className={`mt-3 text-sm ${message.kind === "ok" ? "text-success-bright" : "text-danger"}`}>{message.kind === "ok" && <Check className="inline size-4 mr-1 -mt-0.5" aria-hidden />}{message.text}</p>}</div>
              {plans.length === 0 && <p className="text-xs text-fg-muted mt-2">No payment plans yet. Create one in Plans to assign it here.</p>}
            </section>

            {(row.paymentFlags.length > 0) && (
              <section className={`${section} bg-amber-500/[0.04]`} aria-labelledby="ud-issues">
                <h3 id="ud-issues" className={`${h3} text-amber-300`}>Payment issues</h3>
                <ul className="space-y-3">
                  {row.paymentFlags.map((f) => (
                    <li key={f.sessionId} className="text-sm text-fg-soft">
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border mr-2 ${flagStyle(f)}`}>{flagLabel(f)}</span>
                      {formatPaid(f.amountTotal, f.currency)}{f.refundedAmount ? <> · refunded {formatPaid(f.refundedAmount, f.currency)}</> : null}{f.activatedAt > 0 && <> · {formatDate(f.activatedAt)}</>}
                      <span className="block text-xs text-fg-muted font-mono mt-0.5 break-all">{f.sessionId}</span>
                      {f.reviewNote && <span className="block text-xs text-fg-muted mt-0.5">{f.reviewNote}</span>}
                      {f.needsReview && <button type="button" onClick={() => markReviewed(f.sessionId)} className="mt-1 text-xs font-semibold text-amber-300 underline underline-offset-2 hover:text-amber-200">Mark reviewed</button>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className={section} aria-labelledby="ud-payments">
              <h3 id="ud-payments" className={h3}>Payments</h3>
              {detail.payments.length === 0 ? <p className="text-sm text-fg-muted">No payments recorded.</p> : (
                <ul className="divide-y divide-line">
                  {detail.payments.map((p) => (
                    <li key={p.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-fg">{formatPaid(p.amountTotal, p.currency)}{p.amountTotal === 0 && p.promoCode ? <span className="text-xs text-fg-muted"> · code {p.promoCode}</span> : null}</span>
                      <span className="text-xs text-fg-muted whitespace-nowrap">{p.status !== "fulfilled" && <span className="mr-2 capitalize">{p.status.replace("_", " ")}</span>}{formatDate(p.activatedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={section} aria-labelledby="ud-galleries">
              <h3 id="ud-galleries" className={h3}>Galleries ({row.galleryCount})</h3>
              {detail.galleries.length === 0 ? <p className="text-sm text-fg-muted">No galleries yet.</p> : (
                <ul className="space-y-3">
                  {detail.galleries.map((g) => (
                    <li key={g.id}>
                      {editing === g.id ? (
                        <GalleryEditForm gallery={g} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-medium text-fg truncate">{g.name}</span><span className="text-xs border border-line rounded-full px-2 py-0.5 text-fg-muted">{g.visibility === "private" ? "Private" : "Public"}</span></div>
                            <div className="text-xs text-fg-muted font-mono truncate">/gallery/{g.slug} · {formatDate(g.createdAt)}</div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <a href={`/gallery/${g.slug}`} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label={`Open ${g.name}`}><ExternalLink className="size-3.5" aria-hidden /></a>
                            {g.folderId && <a href={`https://drive.google.com/drive/folders/${g.folderId}`} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label={`Drive folder of ${g.name}`}><FolderOpen className="size-3.5" aria-hidden /></a>}
                            <button type="button" onClick={() => setEditing(g.id)} className={iconBtn} aria-label={`Edit ${g.name}`}><Pencil className="size-3.5" aria-hidden /></button>
                            {galleryDelete === g.id ? (
                              <span className="flex items-center gap-1.5"><span className="text-xs text-danger">Sure?</span><Button size="sm" variant="danger" loading={busy === `g-${g.id}`} onClick={() => deleteGallery(g.id)}>Yes</Button><Button size="sm" variant="ghost" onClick={() => setGalleryDelete(null)}>No</Button></span>
                            ) : <button type="button" onClick={() => setGalleryDelete(g.id)} className={`${iconBtn} hover:text-danger`} aria-label={`Delete ${g.name}`}><Trash2 className="size-3.5" aria-hidden /></button>}
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {row.galleryCount > detail.galleries.length && <p className="text-xs text-fg-muted mt-3">Showing the newest {detail.galleries.length} of {row.galleryCount}.</p>}
            </section>

            <section className={section} aria-labelledby="ud-activity">
              <h3 id="ud-activity" className={h3}>What administrators did</h3>
              {detail.activity.length === 0 ? <p className="text-sm text-fg-muted">Nothing recorded yet.</p> : (
                <ul className="space-y-1.5">{detail.activity.map((a) => <li key={a.id} className="flex justify-between gap-3 text-sm"><span className="text-fg-soft">{ACTION_LABEL[a.action] ?? a.action}</span><span className="text-xs text-fg-muted whitespace-nowrap">{formatDate(a.at)}</span></li>)}</ul>
              )}
            </section>

            <section className="px-5 py-5 bg-red-500/[0.03]" aria-labelledby="ud-danger">
              <h3 id="ud-danger" className={`${h3} text-danger`}>Delete this user</h3>
              <p className="text-sm text-fg-muted mb-3">Permanently removes the account, its subscription and {row.galleryCount} {row.galleryCount === 1 ? "gallery" : "galleries"}. This cannot be undone. Type their e-mail address to confirm.</p>
              <div className="flex gap-2 flex-wrap">
                <label htmlFor="ud-del" className="sr-only">Type the e-mail address to confirm</label>
                <input id="ud-del" value={deleteTyped} onChange={(e) => setDeleteTyped(e.target.value)} placeholder={row.email} autoComplete="off" className="min-w-0 flex-1 bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-muted" />
                <Button size="sm" variant="danger" disabled={!emailMatches || !!busy} loading={busy === "delete"} onClick={deleteUser}>Delete permanently</Button>
              </div>
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
