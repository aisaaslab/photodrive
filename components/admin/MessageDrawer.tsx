"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Mail, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/auth/AuthProvider";
import { STATE_LABEL, replyMailto } from "@/lib/shared/support";
import type { AdminMessage } from "@/lib/server/repos/admin-messages";
import { formatDate, formatDateTime } from "./admin-format";

const section = "px-5 py-5 border-b border-line";
const h3 = "text-xs font-semibold tracking-wide uppercase text-fg-muted mb-3";
type Result = { kind: "ok" | "error"; text: string };

export function StateBadge({ state }: { state: AdminMessage["state"] }) {
  const tone = state === "unread" ? "bg-accent/15 text-accent border-accent/30" : state === "resolved" ? "bg-emerald-500/10 text-success-bright border-emerald-500/20" : "bg-surface-2 text-fg-soft border-line";
  return <span data-ui="message-state" data-state={state} className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${tone}`}>{STATE_LABEL[state]}</span>;
}

/** One support message in full (S8-02): who wrote it and the account behind that e-mail, a reply link, an internal note, and resolve / reopen / delete. Opening an unread message marks it read. */
export function MessageDrawer({ message, onClose, onChanged, onDeleted }: { message: AdminMessage; onClose: () => void; onChanged: (m: AdminMessage) => void; onDeleted: (id: string) => void }) {
  const { user } = useAuth();
  const [m, setM] = useState(message);
  const [note, setNote] = useState(message.note ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const autoRead = useRef(false);

  const patch = async (body: Record<string, unknown>, label: string): Promise<AdminMessage | null> => {
    setBusy(label);
    try {
      const res = await fetch(`/api/admin/messages/${encodeURIComponent(m.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user!.getIdToken()}` }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setResult({ kind: "error", text: d.error || "That did not work. Nothing was changed." }); return null; }
      setM(d.message); setNote(d.message.note ?? ""); onChanged(d.message);
      return d.message as AdminMessage;
    } catch { setResult({ kind: "error", text: "That did not work. Nothing was changed." }); return null; } finally { setBusy(null); }
  };

  // Opening a message that nobody has read yet marks it read (once).
  useEffect(() => {
    if (autoRead.current || !user || message.state !== "unread") return;
    autoRead.current = true;
    void patch({ read: true }, "auto-read"); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const resolve = async () => { setResult(null); const r = await patch({ status: "resolved", note: note.trim() || undefined }, "resolve"); if (r) setResult({ kind: "ok", text: "Marked resolved." }); };
  const reopen = async () => { setResult(null); const r = await patch({ status: "open" }, "reopen"); if (r) setResult({ kind: "ok", text: "Reopened." }); };
  const markUnread = async () => { setResult(null); const r = await patch({ read: false }, "unread"); if (r) setResult({ kind: "ok", text: "Marked unread." }); };
  const saveNote = async () => { setResult(null); const r = await patch({ note }, "note"); if (r) setResult({ kind: "ok", text: note.trim() ? "Note saved." : "Note removed." }); };

  const remove = async () => {
    setBusy("delete"); setResult(null);
    try {
      const res = await fetch(`/api/admin/messages/${encodeURIComponent(m.id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${await user!.getIdToken()}` } });
      if (!res.ok) { setResult({ kind: "error", text: (await res.json().catch(() => ({}))).error || "That did not work." }); return; }
      onDeleted(m.id);
    } catch { setResult({ kind: "error", text: "That did not work." }); } finally { setBusy(null); }
  };

  const copy = async () => { try { await navigator.clipboard.writeText(m.email); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } };
  const noteChanged = note.trim() !== (m.note ?? "");
  const a = m.account;

  return (
    <Modal onClose={onClose} ariaLabel={`Message from ${m.name}`} align="end" className="w-full max-w-[560px] bg-canvas border-l border-line overflow-y-auto shadow-2xl">
      <div data-ui="message-drawer">
        <div className="sticky top-0 z-10 flex items-start gap-3 px-5 py-4 bg-canvas/95 backdrop-blur border-b border-line">
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-fg break-words" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{m.subject || "(no subject)"}</h2>
            <p className="text-sm text-fg-muted mt-0.5 break-words">{m.name} · {m.email}</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap"><StateBadge state={m.state} /><span className="text-xs text-fg-muted">{formatDateTime(m.createdAt)}</span>{m.resolvedAt && <span className="text-xs text-fg-muted">resolved {formatDate(m.resolvedAt)}</span>}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 border border-line rounded-lg text-fg-muted hover:text-fg"><X className="size-4" /></button>
        </div>

        {result && <p role={result.kind === "error" ? "alert" : "status"} data-ui="message-result" className={`mx-5 mt-4 rounded-xl border px-4 py-3 text-sm ${result.kind === "ok" ? "border-emerald-500/25 bg-emerald-500/[0.06] text-success-bright" : "border-red-500/25 bg-red-500/[0.06] text-danger"}`}>{result.text}</p>}

        <div className={section}>
          <h3 className={h3}>Message</h3>
          <p data-ui="message-body" className="text-sm text-fg whitespace-pre-wrap break-words leading-relaxed">{m.message}</p>
          {!m.emailed && <p className="mt-3 text-xs text-amber-300">This message could not be forwarded to the support e-mail when it arrived. It is only here.</p>}
        </div>

        <div className={section}>
          <h3 className={h3}>Reply</h3>
          <div className="flex flex-wrap gap-2">
            <a href={replyMailto(m)} data-ui="reply-link" className="inline-flex items-center gap-2 h-9 px-4 rounded-pill bg-accent text-canvas text-sm font-semibold hover:brightness-110"><Mail className="size-4" aria-hidden /> Reply by e-mail</a>
            <Button variant="outline" size="sm" onClick={copy} iconLeft={copied ? <Check className="size-4" aria-hidden /> : undefined}>{copied ? "Copied" : "Copy e-mail address"}</Button>
          </div>
          <p className="mt-2 text-xs text-fg-muted">Opens your own mail program, addressed to {m.email}. Come back and mark the message resolved when you have answered.</p>
        </div>

        <div className={section} data-ui="message-account">
          <h3 className={h3}>The sender</h3>
          {a ? (
            <div className="text-sm">
              <p className="text-fg font-medium">{a.name || "—"} <span className="ml-1 inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-success-bright">Customer</span></p>
              <p className="text-fg-muted">{a.email}</p>
              <p className="text-fg-muted mt-1">{a.active ? `Plan active until ${formatDate(a.subscriptionExpiresAt)}` : a.subscriptionExpiresAt ? `Plan ended ${formatDate(a.subscriptionExpiresAt)}` : "No plan"}</p>
              <div className="mt-3 flex flex-wrap gap-4">
                <Link href={`/dashboard/admin/users?q=${encodeURIComponent(a.email)}`} data-ui="open-account" className="font-semibold text-accent hover:underline">Open the account →</Link>
                <Link href={`/dashboard/admin/payments?q=${encodeURIComponent(a.email)}`} data-ui="open-payments" className="font-semibold text-accent hover:underline">See their payments →</Link>
              </div>
            </div>
          ) : <p className="text-sm text-fg-muted" data-ui="no-account">No account uses this e-mail address. It is probably a visitor, or a customer writing from another address.</p>}
        </div>

        <div className={section}>
          <h3 className={h3}>Internal note</h3>
          <label htmlFor="message-note" className="sr-only">Internal note</label>
          <textarea id="message-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} rows={3} placeholder="For the team only. The sender never sees this." className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-accent/60" />
          <div className="mt-2 flex items-center gap-3">
            <Button variant="outline" size="sm" disabled={!noteChanged} loading={busy === "note"} onClick={saveNote} data-ui="save-note">{note.trim() || !m.note ? "Save note" : "Remove note"}</Button>
            {m.noteAt && <span className="text-xs text-fg-muted">last saved {formatDateTime(m.noteAt)}</span>}
          </div>
        </div>

        <div className={section}>
          <h3 className={h3}>Status</h3>
          <div className="flex flex-wrap gap-2">
            {m.state === "resolved"
              ? <Button size="sm" variant="outline" loading={busy === "reopen"} onClick={reopen} data-ui="reopen">Reopen</Button>
              : <Button size="sm" loading={busy === "resolve"} onClick={resolve} data-ui="resolve">Mark resolved</Button>}
            {m.state === "read" && <Button size="sm" variant="outline" loading={busy === "unread"} onClick={markUnread} data-ui="mark-unread">Mark unread</Button>}
          </div>
          <p className="mt-2 text-xs text-fg-muted">Resolving saves any note you have written above with it, and is recorded under your name.</p>
        </div>

        <div className="px-5 py-5">
          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)} data-ui="delete-start" className="text-sm font-semibold text-danger hover:underline">Delete this message…</button>
          ) : (
            <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-4" data-ui="delete-confirm">
              <p className="text-sm text-fg">Delete this message for good? Prefer “Mark resolved” if you only want it out of the way.</p>
              <div className="mt-3 flex gap-2"><Button variant="danger" size="sm" loading={busy === "delete"} onClick={remove} data-ui="delete-confirm-button">Yes, delete</Button><Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button></div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
