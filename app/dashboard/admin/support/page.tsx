"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { MessageDrawer, StateBadge } from "@/components/admin/MessageDrawer";
import { formatDate } from "@/components/admin/admin-format";
import type { AdminMessage, MessageCounts } from "@/lib/server/repos/admin-messages";
import type { MessageFilter } from "@/lib/shared/support";

type Page = { messages: AdminMessage[]; nextCursor: string | null; counts: MessageCounts };
const EMPTY: MessageCounts = { total: 0, unread: 0, open: 0, resolved: 0 };
const excerpt = (t: string) => (t.replace(/\s+/g, " ").length > 110 ? `${t.replace(/\s+/g, " ").slice(0, 110)}…` : t.replace(/\s+/g, " "));

/** Support (S8-02): the contact-form messages as an inbox: what still needs an answer first, searchable, each matched to the customer behind the e-mail address. */
export default function AdminSupportPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AdminMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [counts, setCounts] = useState<MessageCounts>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<MessageFilter>("open");
  const [open, setOpen] = useState<AdminMessage | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const fetchPage = useCallback(async (after: string | null): Promise<Page> => {
    const params = new URLSearchParams({ filter, limit: "25" });
    if (q) params.set("q", q);
    if (after) params.set("cursor", after);
    const res = await fetch(`/api/admin/messages?${params}`, { headers: { Authorization: `Bearer ${await user!.getIdToken()}` } });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }, [user, filter, q]);

  const reload = useCallback(async () => {
    if (!user) return;
    const mine = ++seq.current;
    setLoading(true); setError("");
    try {
      const page = await fetchPage(null);
      if (mine !== seq.current) return;
      setRows(page.messages); setCursor(page.nextCursor); setCounts(page.counts);
    } catch { if (mine === seq.current) setError("Could not load messages. Please try again."); } finally { if (mine === seq.current) setLoading(false); }
  }, [user, fetchPage]);
  useEffect(() => { void reload(); }, [reload]);

  const loadMore = async () => {
    if (!cursor) return;
    const mine = seq.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage(cursor);
      if (mine !== seq.current) return;
      setRows((prev) => { const seen = new Set(prev.map((r) => r.id)); return [...prev, ...page.messages.filter((r) => !seen.has(r.id))]; });
      setCursor(page.nextCursor);
    } catch { setError("Could not load more. Please try again."); } finally { setLoadingMore(false); }
  };

  const CHIPS: { key: MessageFilter; label: string; n: number; hint: string }[] = [
    { key: "open", label: "Open", n: counts.open, hint: "Everything that still needs an answer, newest first" },
    { key: "unread", label: "Unread", n: counts.unread, hint: "Nobody has opened these yet" },
    { key: "resolved", label: "Resolved", n: counts.resolved, hint: "Dealt with" },
    { key: "all", label: "Everything", n: counts.total, hint: "Every message, newest first" },
  ];
  const hint = CHIPS.find((c) => c.key === filter)?.hint;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>Support</h1>
        <p className="text-sm text-fg-muted mt-1" data-ui="support-summary">{counts.unread} unread · {counts.open} open · messages from the contact form.</p>
      </div>

      <div className="relative mb-4">
        <label htmlFor="support-search" className="sr-only">Search messages</label>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-muted" aria-hidden />
        <input id="support-search" type="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search sender, e-mail, subject or text"
          className="w-full bg-surface-2 border border-line rounded-xl pl-9 pr-4 py-2.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-accent/60" />
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-2" role="group" aria-label="Show">
        {CHIPS.map((c) => (
          <button key={c.key} type="button" onClick={() => setFilter(c.key)} aria-pressed={filter === c.key}
            className={`text-xs font-semibold px-3 py-1.5 rounded-pill border transition-colors ${filter === c.key ? "bg-accent text-canvas border-accent" : "bg-surface text-fg-muted border-line hover:text-fg hover:border-fg-muted/40"}`}>{c.label} <span className="tabular-nums opacity-80">{c.n}</span></button>
        ))}
      </div>
      <p className="text-xs text-fg-muted mb-4">{hint}{q && filter !== "all" ? " · filter applied to the matches" : ""}</p>

      {error && <p role="alert" className="mb-4 text-sm text-danger">{error} <button type="button" className="underline" onClick={() => void reload()}>Retry</button></p>}

      <div data-ui="messages-list" aria-busy={loading} className="rounded-card border border-line bg-surface overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="py-16 flex justify-center"><div className="size-5 border-2 border-fg-muted/30 border-t-fg rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-fg-muted">{q ? `No message matches “${q}”.` : filter === "open" ? "Nothing waiting for an answer. Well done." : "No messages here."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => setOpen(m)} data-ui="message-row" data-state={m.state} aria-haspopup="dialog" className="w-full grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-surface-2 transition-colors">
                  <span aria-hidden className={`mt-1.5 size-2 rounded-full ${m.state === "unread" ? "bg-accent" : "bg-transparent"}`} />
                  <span className="min-w-0">
                    <span className={`block text-sm truncate ${m.state === "unread" ? "font-bold text-fg" : "font-medium text-fg"}`}>{m.name} <span className="font-normal text-fg-muted">· {m.subject || "(no subject)"}</span></span>
                    <span className="block text-xs text-fg-muted truncate">{excerpt(m.message)}</span>
                    <span className="mt-1.5 flex items-center gap-2 flex-wrap">
                      <StateBadge state={m.state} />
                      {m.account && <span data-ui="customer-badge" className="text-[11px] font-semibold text-success-bright">Customer</span>}
                      {m.note && <span className="text-[11px] text-fg-muted">has a note</span>}
                    </span>
                  </span>
                  <span className="text-xs text-fg-muted whitespace-nowrap">{formatDate(m.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {cursor && <div className="mt-5 flex justify-center"><Button variant="outline" size="sm" loading={loadingMore} onClick={loadMore}>Load more</Button></div>}
      {!cursor && rows.length > 0 && <p className="mt-4 text-center text-xs text-fg-muted">{rows.length.toLocaleString("en-US")} shown · end of list</p>}

      {open && (
        <MessageDrawer key={open.id} message={open}
          onClose={() => { setOpen(null); void reload(); }}
          onChanged={(m) => setRows((prev) => prev.map((r) => (r.id === m.id ? m : r)))}
          onDeleted={(id) => { setOpen(null); setRows((prev) => prev.filter((r) => r.id !== id)); void reload(); }} />
      )}
    </div>
  );
}
