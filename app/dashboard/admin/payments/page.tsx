"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { PaymentDrawer } from "@/components/admin/PaymentDrawer";
import { PaymentsAttention } from "@/components/admin/PaymentsAttention";
import { StatusBadge } from "@/components/admin/PaymentStatusBadge";
import { formatDate, formatPaid } from "@/components/admin/admin-format";
import type { AdminPaymentRow, AttentionEvent, AttentionPayment, PaymentSummary } from "@/lib/server/repos/admin-payments";
import type { PaymentFilter } from "@/lib/shared/admin-payments";

const FILTERS: { key: PaymentFilter; label: string; hint: string }[] = [
  { key: "all", label: "Everything", hint: "Newest first" },
  { key: "paid", label: "Paid", hint: "Card payments that were not refunded or disputed" },
  { key: "free_code", label: "Free codes", hint: "Checkouts made with a 100%-off code" },
  { key: "refunded", label: "Refunded", hint: "Fully or partly refunded" },
  { key: "disputed", label: "Disputed", hint: "An open dispute, or one that was lost" },
  { key: "needs_review", label: "Needs review", hint: "Flagged for a person to look at" },
];
type Page = { payments: AdminPaymentRow[]; nextCursor: string | null };
type Queue = { events: AttentionEvent[]; payments: AttentionPayment[] };

/** Payments (S8-01): what was taken per currency, the queue of things that need a person, and every payment with its status, searchable and paged. */
export default function AdminPaymentsPage() {
  return <Suspense fallback={null}><PaymentsScreen /></Suspense>;
}

function PaymentsScreen() {
  const { user } = useAuth();
  const initialQuery = useSearchParams().get("q") ?? "";
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [rows, setRows] = useState<AdminPaymentRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState(initialQuery);
  const [q, setQ] = useState(initialQuery);
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [flash, setFlash] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const authed = useCallback(async (url: string) => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await user!.getIdToken()}` } });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }, [user]);

  const fetchPage = useCallback(async (after: string | null): Promise<Page> => {
    const params = new URLSearchParams({ filter, limit: "25" });
    if (q) params.set("q", q);
    if (after) params.set("cursor", after);
    return authed(`/api/admin/payments?${params}`);
  }, [authed, filter, q]);

  const reloadList = useCallback(async () => {
    if (!user) return;
    const mine = ++seq.current;
    setLoading(true); setError("");
    try {
      const page = await fetchPage(null);
      if (mine !== seq.current) return;
      setRows(page.payments); setCursor(page.nextCursor);
    } catch { if (mine === seq.current) setError("Could not load payments. Please try again."); } finally { if (mine === seq.current) setLoading(false); }
  }, [user, fetchPage]);
  useEffect(() => { void reloadList(); }, [reloadList]);

  const reloadTop = useCallback(async () => {
    if (!user) return;
    try { const [s, a] = await Promise.all([authed("/api/admin/payments/summary"), authed("/api/admin/payments/attention")]); setSummary(s); setQueue(a); } catch { /* the list shows its own error */ }
  }, [user, authed]);
  useEffect(() => { void reloadTop(); }, [reloadTop]);

  const refreshAll = () => { void reloadList(); void reloadTop(); };
  const resolved = (message: string) => { setFlash(message); refreshAll(); };

  const loadMore = async () => {
    if (!cursor) return;
    const mine = seq.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage(cursor);
      if (mine !== seq.current) return;
      setRows((prev) => { const seen = new Set(prev.map((r) => r.id)); return [...prev, ...page.payments.filter((r) => !seen.has(r.id))]; });
      setCursor(page.nextCursor);
    } catch { setError("Could not load more. Please try again."); } finally { setLoadingMore(false); }
  };

  const hint = FILTERS.find((f) => f.key === filter)?.hint;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>Payments</h1>
        <p className="text-sm text-fg-muted mt-1">What was taken, what needs a person, and every payment with its status.</p>
      </div>

      {flash && <p role="status" data-ui="flash" className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3 text-sm text-success-bright">{flash} <button type="button" className="underline ml-1" onClick={() => setFlash("")}>Dismiss</button></p>}

      <section aria-label="Totals" data-ui="totals" className="mb-6">
        <p className="text-xs text-fg-muted mb-2">Last {summary?.days ?? 30} days{summary ? ` · ${summary.paidCount} paid, ${summary.freeCodeCount} with a free code` : ""}. Each currency on its own, never added together.</p>
        {!summary ? <div className="h-20 rounded-card bg-surface animate-pulse" /> : summary.byCurrency.length === 0 ? (
          <p className="rounded-card border border-line bg-surface px-4 py-4 text-sm text-fg-muted">No money was taken in this period.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.byCurrency.map((c) => (
              <div key={c.currency} data-ui="total-card" data-currency={c.currency} className="rounded-card border border-line bg-surface px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{c.currency.toUpperCase()}</p>
                <p className="mt-1 text-2xl font-bold text-fg tabular-nums">{formatPaid(c.net, c.currency)}</p>
                <p className="text-xs text-fg-muted mt-1">net · {c.count} payment{c.count === 1 ? "" : "s"}{c.refunded > 0 ? ` · ${formatPaid(c.refunded, c.currency)} refunded` : ""}</p>
              </div>
            ))}
          </div>
        )}
        {summary?.truncated && <p className="mt-2 text-xs text-amber-300">This period has more payments than can be totalled here; the figures cover the most recent 3,000.</p>}
      </section>

      {queue && <PaymentsAttention events={queue.events} payments={queue.payments} onOpenPayment={setOpen} onResolved={resolved} />}

      <div className="relative mb-4">
        <label htmlFor="payment-search" className="sr-only">Search payments</label>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-muted" aria-hidden />
        <input id="payment-search" type="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search e-mail, cs_… or pi_… id"
          className="w-full bg-surface-2 border border-line rounded-xl pl-9 pr-4 py-2.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-accent/60" />
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-2" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
            className={`text-xs font-semibold px-3 py-1.5 rounded-pill border transition-colors ${filter === f.key ? "bg-accent text-canvas border-accent" : "bg-surface text-fg-muted border-line hover:text-fg hover:border-fg-muted/40"}`}>{f.label}</button>
        ))}
      </div>
      <p className="text-xs text-fg-muted mb-4">{hint}{q && filter !== "all" ? " · filter applied to the matches" : ""}</p>

      {error && <p role="alert" className="mb-4 text-sm text-danger">{error} <button type="button" className="underline" onClick={() => void reloadList()}>Retry</button></p>}

      <div data-ui="payments-list" aria-busy={loading} className="rounded-card border border-line bg-surface overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="py-16 flex justify-center"><div className="size-5 border-2 border-fg-muted/30 border-t-fg rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-fg-muted">{q ? `No payment matches “${q}”.` : "No payments here yet."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setOpen(p.id)} data-ui="payment-row" aria-haspopup="dialog" className="w-full grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,2fr)_110px_minmax(0,1.2fr)_110px] items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-surface-2 transition-colors">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-fg truncate">{p.email ?? "Unknown customer"}</span>
                    <span className="block text-xs text-fg-muted truncate">{p.source === "free_code" ? `Free code${p.promoCode ? ` · ${p.promoCode}` : ""}` : p.interval ?? "Card payment"}{p.livemode === false ? " · test mode" : ""}</span>
                  </span>
                  <span data-ui="payment-amount" className="justify-self-end md:justify-self-start text-sm font-semibold text-fg tabular-nums">{formatPaid(p.amountTotal, p.currency)}</span>
                  <span className="col-span-2 md:col-span-1"><StatusBadge status={p.status} needsReview={p.needsReview} source={p.source} /></span>
                  <span className="hidden md:block text-xs text-fg-muted text-right">{formatDate(p.activatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {cursor && <div className="mt-5 flex justify-center"><Button variant="outline" size="sm" loading={loadingMore} onClick={loadMore}>Load more</Button></div>}
      {!cursor && rows.length > 0 && <p className="mt-4 text-center text-xs text-fg-muted">{rows.length.toLocaleString("en-US")} shown · end of list</p>}

      {open && <PaymentDrawer id={open} onClose={() => setOpen(null)} onChanged={refreshAll} />}
    </div>
  );
}
