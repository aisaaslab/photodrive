"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, RefreshCw, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/auth/AuthProvider";
import { STATUS_LABEL, outcomeLabel } from "@/lib/shared/admin-payments";
import type { AdminPaymentDetail } from "@/lib/server/repos/admin-payments";
import { formatDate, formatDateTime, formatPaid } from "./admin-format";
import { StatusBadge } from "./PaymentStatusBadge";

const section = "px-5 py-5 border-b border-line";
const h3 = "text-xs font-semibold tracking-wide uppercase text-fg-muted mb-3";
const ACTION_LABEL: Record<string, string> = { "payment.resync": "Re-synced with Stripe", "payment.review": "Marked reviewed", "payment.review_event": "Stripe event marked reviewed" };

type Result = { kind: "ok" | "error"; text: string };

/** The detail drawer of one payment (S8-01): its record, the customer, the Stripe events that touched it, what administrators did, and the re-sync and review actions. */
export function PaymentDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<AdminPaymentDetail | null>(null);
  const [error, setError] = useState("");
  const [confirmSync, setConfirmSync] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const headers = useCallback(async () => ({ "Content-Type": "application/json", Authorization: `Bearer ${await user!.getIdToken()}` }), [user]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/admin/payments/${encodeURIComponent(id)}`, { headers: await headers() });
      if (!res.ok) { setError(res.status === 404 ? "This payment no longer exists." : "Could not load this payment."); return; }
      setDetail(await res.json()); setError("");
    } catch { setError("Could not load this payment."); }
  }, [user, id, headers]);
  useEffect(() => { void load(); }, [load]);

  const resync = async () => {
    setBusy("resync"); setResult(null);
    try {
      const res = await fetch(`/api/admin/payments/${encodeURIComponent(id)}/resync`, { method: "POST", headers: await headers(), body: JSON.stringify({ note: note.trim() || undefined }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setResult({ kind: "error", text: d.error || "That did not work. Nothing was changed." }); return; }
      setResult({ kind: "ok", text: d.state === "fulfilled" ? `Done: access was granted (${d.grantedDays} days).` : "Checked: this payment was already fulfilled, so nothing changed." });
      setConfirmSync(false); setNote(""); await load(); onChanged();
    } catch { setResult({ kind: "error", text: "That did not work. Nothing was changed." }); } finally { setBusy(null); }
  };

  const markReviewed = async () => {
    setBusy("review"); setResult(null);
    try {
      const res = await fetch("/api/admin/review", { method: "POST", headers: await headers(), body: JSON.stringify({ kind: "payment", id, note: note.trim() || undefined }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setResult({ kind: "error", text: d.error || "That did not work." }); return; }
      setResult({ kind: "ok", text: "Marked reviewed." }); setNote(""); await load(); onChanged();
    } catch { setResult({ kind: "error", text: "That did not work." }); } finally { setBusy(null); }
  };

  const p = detail?.payment;
  return (
    <Modal onClose={onClose} ariaLabel={p ? `Payment ${p.id}` : "Payment details"} align="end" className="w-full max-w-[560px] bg-canvas border-l border-line overflow-y-auto shadow-2xl">
      <div data-ui="payment-drawer">
        <div className="sticky top-0 z-10 flex items-start gap-3 px-5 py-4 bg-canvas/95 backdrop-blur border-b border-line">
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-fg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{p ? formatPaid(p.amountTotal, p.currency) : "Loading…"}</h2>
            <p className="text-xs text-fg-muted font-mono truncate">{id}</p>
            {p && <div className="mt-2 flex items-center gap-2 flex-wrap"><StatusBadge status={p.status} needsReview={p.needsReview} source={p.source} /><span className="text-xs text-fg-muted">{formatDateTime(p.activatedAt)}</span>{p.livemode === false && <span className="text-[11px] font-semibold text-fg-muted border border-line rounded-full px-2 py-0.5">Test mode</span>}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 border border-line rounded-lg text-fg-muted hover:text-fg"><X className="size-4" /></button>
        </div>

        {error && <p role="alert" className="px-5 py-6 text-sm text-danger">{error}</p>}
        {!detail && !error && <div className="py-16 flex justify-center"><div className="size-5 border-2 border-fg-muted/30 border-t-fg rounded-full animate-spin" /></div>}

        {detail && p && (
          <>
            {result && <p role={result.kind === "error" ? "alert" : "status"} data-ui="payment-result" className={`mx-5 mt-4 rounded-xl border px-4 py-3 text-sm ${result.kind === "ok" ? "border-emerald-500/25 bg-emerald-500/[0.06] text-success-bright" : "border-red-500/25 bg-red-500/[0.06] text-danger"}`}>{result.text}</p>}

            <div className={section}>
              <h3 className={h3}>Payment</h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-fg-muted">Status</dt><dd className="text-fg">{STATUS_LABEL[p.status]}{p.refundedAmount ? ` · ${formatPaid(p.refundedAmount, p.currency)} refunded` : ""}</dd>
                <dt className="text-fg-muted">How</dt><dd className="text-fg">{p.source === "free_code" ? `Free code${p.promoCode ? ` · ${p.promoCode}` : ""}` : "Card payment"}</dd>
                <dt className="text-fg-muted">Plan</dt><dd className="text-fg">{p.interval ?? "—"}{detail.details.grantedDays ? ` · ${detail.details.grantedDays} days of access` : ""}</dd>
                <dt className="text-fg-muted">Access until</dt><dd className="text-fg">{detail.details.expiresAtAfter ? formatDate(detail.details.expiresAtAfter) : "—"}</dd>
                <dt className="text-fg-muted">Fulfilled by</dt><dd className="text-fg">{detail.details.fulfilledBy ?? "—"}</dd>
                <dt className="text-fg-muted">Invoice</dt><dd className="text-fg">{p.hasInvoice ? "Issued by Stripe" : "None"}</dd>
              </dl>
              {p.reviewNote && <p className="mt-3 text-sm text-amber-300">{p.reviewNote}</p>}
              {p.stripeUrl && <a href={p.stripeUrl} target="_blank" rel="noopener noreferrer" data-ui="stripe-link" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">Open in Stripe <ExternalLink className="size-3.5" aria-hidden /></a>}
            </div>

            <div className={section}>
              <h3 className={h3}>Customer</h3>
              {detail.customer ? (
                <div className="text-sm">
                  <p className="text-fg font-medium">{detail.customer.name || "—"}</p>
                  <p className="text-fg-muted">{detail.customer.email}</p>
                  <p className="text-fg-muted mt-1">Access ends {detail.customer.subscriptionExpiresAt ? formatDate(detail.customer.subscriptionExpiresAt) : "—"}</p>
                  {detail.customer.email && <Link href={`/dashboard/admin/users?q=${encodeURIComponent(detail.customer.email)}`} className="mt-2 inline-block text-sm font-semibold text-accent hover:underline">Open this customer →</Link>}
                </div>
              ) : <p className="text-sm text-fg-muted">No customer is recorded for this payment.</p>}
            </div>

            <div className={section}>
              <h3 className={h3}>Stripe events</h3>
              {detail.events.length === 0 ? <p className="text-sm text-fg-muted">No events recorded for this payment.</p> : (
                <ul className="space-y-2.5" data-ui="payment-events">
                  {detail.events.map((e) => (
                    <li key={e.id} className="text-sm">
                      <p className="text-fg"><span className="font-mono text-xs">{e.type}</span> <span className="text-fg-muted">· {e.status === "needs_review" && !e.resolved ? "needs review" : e.resolved ? "reviewed" : e.status}</span></p>
                      <p className="text-xs text-fg-muted">{formatDateTime(e.receivedAt)}{e.outcome ? ` · ${outcomeLabel(e.outcome)}` : ""}{e.error ? ` · ${e.error}` : ""}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={section}>
              <h3 className={h3}>Actions</h3>
              <label htmlFor="payment-note" className="block text-xs font-medium text-fg-muted mb-1.5">Note for the record (optional)</label>
              <input id="payment-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="e.g. customer wrote in on Tuesday" className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-accent/60" />
              <div className="mt-3 flex flex-wrap gap-2">
                {!confirmSync ? (
                  <Button variant="outline" size="sm" iconLeft={<RefreshCw className="size-4" aria-hidden />} onClick={() => setConfirmSync(true)} data-ui="resync-start">Re-sync with Stripe</Button>
                ) : (
                  <div className="w-full rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4" data-ui="resync-confirm">
                    <p className="text-sm text-fg">This asks Stripe about this payment and, if it was paid, makes sure the customer has the access it paid for. It is safe to repeat: access is never granted twice. The action is recorded under your name.</p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" loading={busy === "resync"} onClick={resync} data-ui="resync-confirm-button">Yes, re-sync</Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmSync(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
                {p.needsReview && <Button variant="outline" size="sm" loading={busy === "review"} onClick={markReviewed} data-ui="mark-reviewed">Mark reviewed</Button>}
              </div>
            </div>

            <div className={section}>
              <h3 className={h3}>What administrators did</h3>
              {detail.activity.length === 0 ? <p className="text-sm text-fg-muted">Nothing yet.</p> : (
                <ul className="space-y-2" data-ui="payment-activity">
                  {detail.activity.map((a) => (
                    <li key={a.id} className="text-sm"><span className="text-fg">{ACTION_LABEL[a.action] ?? a.action}</span><span className="text-fg-muted"> · {formatDateTime(a.at)}</span>{a.note && <p className="text-xs text-fg-muted">{a.note}</p>}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
