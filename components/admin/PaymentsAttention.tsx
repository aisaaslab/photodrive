"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/auth/AuthProvider";
import { outcomeLabel } from "@/lib/shared/admin-payments";
import type { AttentionEvent, AttentionPayment } from "@/lib/server/repos/admin-payments";
import { formatDateTime, formatPaid } from "./admin-format";
import { StatusBadge } from "./PaymentStatusBadge";

type UserHit = { uid: string; email: string; displayName: string };

/** Pick the customer a payment belongs to (for a payment Stripe took that could not be matched to anyone), then credit it (S8-01). */
function AssignCustomerModal({ event, onClose, onDone }: { event: AttentionEvent; onClose: () => void; onDone: (message: string) => void }) {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [searched, setSearched] = useState("");
  const [picked, setPicked] = useState<UserHit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    const q = input.trim();
    if (!user || q.length < 2) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/users?${new URLSearchParams({ q, limit: "5" })}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
        if (!res.ok || mine !== seq.current) return;
        setHits((await res.json()).users ?? []); setSearched(q);
      } catch { /* keep what is shown */ }
    }, 300);
    return () => clearTimeout(t);
  }, [input, user]);

  const credit = async () => {
    if (!user || !picked || !event.sessionId) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/admin/payments/${encodeURIComponent(event.sessionId)}/resync`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ uid: picked.uid, note: `Credited to ${picked.email} from the needs-attention queue` }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "That did not work. Nothing was changed."); return; }
      onDone(d.state === "fulfilled" ? `Credited to ${picked.email}: ${d.grantedDays} days of access granted.` : d.creditedToOther ? "This payment had already been credited to another customer, so nothing was changed." : `Already credited to ${picked.email}. Nothing changed.`);
    } catch { setError("That did not work. Nothing was changed."); } finally { setBusy(false); }
  };

  const shown = input.trim().length >= 2 ? hits : [];
  return (
    <Modal onClose={onClose} ariaLabel="Credit this payment to a customer" className="bg-canvas border border-line rounded-card shadow-2xl w-full max-w-md p-6">
      <div data-ui="assign-customer">
        <h2 className="font-bold text-fg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>Credit this payment to a customer</h2>
        <p className="mt-1 text-sm text-fg-muted">Stripe collected this payment but it could not be matched to anyone. Find the customer it belongs to by e-mail.</p>
        <p className="mt-2 text-xs font-mono text-fg-muted break-all">{event.sessionId}</p>

        {!picked ? (
          <>
            <label htmlFor="assign-search" className="sr-only">Customer e-mail</label>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-muted" aria-hidden />
              <input id="assign-search" type="search" autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search by e-mail, e.g. anna@" className="w-full bg-surface-2 border border-line rounded-xl pl-9 pr-4 py-2.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-accent/60" />
            </div>
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line" data-ui="assign-results" hidden={shown.length === 0}>
              {shown.map((u) => (
                <li key={u.uid}><button type="button" onClick={() => setPicked(u)} className="w-full text-left px-3 py-2.5 hover:bg-surface-2"><span className="block text-sm text-fg">{u.displayName || "—"}</span><span className="block text-xs text-fg-muted">{u.email}</span></button></li>
              ))}
            </ul>
            {input.trim().length >= 2 && searched === input.trim() && hits.length === 0 && <p className="mt-3 text-sm text-fg-muted">No one with an e-mail starting “{input.trim()}”.</p>}
          </>
        ) : (
          <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4" data-ui="assign-confirm">
            <p className="text-sm text-fg">Credit this payment to <strong>{picked.displayName || picked.email}</strong> ({picked.email})? Stripe is asked what was bought and that customer gets the matching access. It is recorded under your name.</p>
            {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
            <div className="mt-3 flex gap-2">
              <Button size="sm" loading={busy} onClick={credit} data-ui="assign-confirm-button">Yes, credit {picked.email.split("@")[0]}</Button>
              <Button variant="ghost" size="sm" onClick={() => { setPicked(null); setError(""); }}>Choose someone else</Button>
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-end"><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div>
      </div>
    </Modal>
  );
}

const age = (ms: number, now: number) => { const d = Math.max(0, Math.floor((now - ms) / 86_400_000)); return d === 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`; };

/** The "needs attention" queue (S8-01): every Stripe event and payment still waiting for a person, with what to do about each, so it can be resolved without leaving the page. */
export function PaymentsAttention({ events, payments, onOpenPayment, onResolved }: { events: AttentionEvent[]; payments: AttentionPayment[]; onOpenPayment: (id: string) => void; onResolved: (message: string) => void }) {
  const { user } = useAuth();
  const [now] = useState(() => Date.now());
  const [assign, setAssign] = useState<AttentionEvent | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const review = useCallback(async (kind: "event" | "payment", id: string) => {
    if (!user) return;
    setBusy(`${kind}:${id}`); setError("");
    try {
      const res = await fetch("/api/admin/review", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ kind, id, note: note.trim() || undefined }) });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "That did not work."); return; }
      setNoteFor(null); setNote(""); onResolved("Marked reviewed.");
    } catch { setError("That did not work."); } finally { setBusy(null); }
  }, [user, note, onResolved]);

  const total = events.length + payments.length;
  if (total === 0) return <p data-ui="attention-empty" className="mb-6 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg-muted">Nothing needs attention. Every payment and Stripe event has been dealt with.</p>;

  const noteForm = (key: string, kind: "event" | "payment", id: string) => noteFor === key && (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-ui="review-form">
      <label htmlFor={`note-${key}`} className="sr-only">Note</label>
      <input id={`note-${key}`} value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder="What did you do? (optional)" className="flex-1 min-w-[200px] bg-surface-2 border border-line rounded-xl px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-accent/60" />
      <Button size="sm" loading={busy === key} onClick={() => review(kind, id)} data-ui="review-confirm">Mark reviewed</Button>
      <Button variant="ghost" size="sm" onClick={() => { setNoteFor(null); setNote(""); }}>Cancel</Button>
    </div>
  );

  return (
    <section data-ui="attention" aria-labelledby="attention-title" className="mb-8 rounded-card border border-amber-500/25 bg-amber-500/[0.04]">
      <div className="px-5 pt-4 pb-2">
        <h2 id="attention-title" className="font-semibold text-fg">Needs attention <span className="ml-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">{total}</span></h2>
        <p className="text-xs text-fg-muted mt-0.5">Oldest first. Deal with each one here, then mark it reviewed so it leaves the daily digest.</p>
      </div>
      {error && <p role="alert" className="px-5 pb-2 text-sm text-danger">{error}</p>}
      <ul className="divide-y divide-amber-500/15">
        {events.map((e) => (
          <li key={e.id} data-ui="attention-event" className="px-5 py-4">
            <p className="text-sm font-semibold text-fg">{outcomeLabel(e.outcome)}</p>
            <p className="text-xs text-fg-muted mt-0.5">{e.type} · {age(e.receivedAt, now)} ({formatDateTime(e.receivedAt)}){e.email ? ` · ${e.email}` : ""}</p>
            {e.sessionId && <p className="text-xs font-mono text-fg-muted mt-0.5 break-all">{e.sessionId}</p>}
            {e.error && <p className="text-xs text-amber-300 mt-0.5">{e.error}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {e.assignable && <Button size="sm" onClick={() => setAssign(e)} data-ui="assign-start">Credit a customer…</Button>}
              {e.sessionId && !e.assignable && <Button variant="outline" size="sm" onClick={() => onOpenPayment(e.sessionId!)}>Open payment</Button>}
              {!e.assignable && <Button variant="outline" size="sm" onClick={() => setNoteFor(noteFor === `event:${e.id}` ? null : `event:${e.id}`)} data-ui="review-start">Mark reviewed…</Button>}
              {e.stripeUrl && <a href={e.stripeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">Open in Stripe <ExternalLink className="size-3" aria-hidden /></a>}
            </div>
            {noteForm(`event:${e.id}`, "event", e.id)}
          </li>
        ))}
        {payments.map((p) => (
          <li key={p.id} data-ui="attention-payment" className="px-5 py-4">
            <p className="text-sm font-semibold text-fg">{formatPaid(p.amountTotal, p.currency)} <span className="font-normal text-fg-muted">· {p.email ?? "unknown customer"}</span></p>
            <div className="mt-1"><StatusBadge status={p.status} /></div>
            {p.reviewNote && <p className="text-xs text-amber-300 mt-1">{p.reviewNote}</p>}
            <p className="text-xs text-fg-muted mt-0.5">{age(p.activatedAt, now)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => onOpenPayment(p.id)}>Open payment</Button>
              <Button size="sm" variant="outline" onClick={() => setNoteFor(noteFor === `payment:${p.id}` ? null : `payment:${p.id}`)} data-ui="review-start">Mark reviewed…</Button>
              {p.stripeUrl && <a href={p.stripeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">Open in Stripe <ExternalLink className="size-3" aria-hidden /></a>}
            </div>
            {noteForm(`payment:${p.id}`, "payment", p.id)}
          </li>
        ))}
      </ul>
      {assign && <AssignCustomerModal event={assign} onClose={() => setAssign(null)} onDone={(m) => { setAssign(null); onResolved(m); }} />}
    </section>
  );
}
