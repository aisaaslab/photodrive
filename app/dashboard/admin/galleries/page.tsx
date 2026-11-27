"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Avatar, formatDate } from "@/components/admin/admin-format";
import type { AdminGalleryRow, GalleryFilter } from "@/lib/server/repos/admin-galleries";

type Page = { galleries: AdminGalleryRow[]; nextCursor: string | null; total: number; disabledCount: number };

const chip = "inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap";

/** Galleries (S7-06): every gallery on the platform, newest first, searchable by link, with a switch to turn one off (or back on). */
export default function AdminGalleriesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AdminGalleryRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [disabledCount, setDisabledCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<GalleryFilter>("all");
  const [target, setTarget] = useState<AdminGalleryRow | null>(null); // the gallery being switched off
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const fetchPage = useCallback(async (after: string | null) => {
    if (!user) return null;
    const params = new URLSearchParams({ filter, limit: "25" });
    if (q) params.set("q", q);
    if (after) params.set("cursor", after);
    const res = await fetch(`/api/admin/galleries?${params}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Page;
  }, [user, filter, q]);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true); setError("");
    try {
      const page = await fetchPage(null);
      if (!page || mine !== seq.current) return;
      setRows(page.galleries); setCursor(page.nextCursor); setTotal(page.total); setDisabledCount(page.disabledCount);
    } catch { if (mine === seq.current) setError("Could not load galleries. Please try again."); } finally { if (mine === seq.current) setLoading(false); }
  }, [fetchPage]);
  useEffect(() => { void reload(); }, [reload]);

  const loadMore = async () => {
    if (!cursor) return;
    const mine = seq.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage(cursor);
      if (!page || mine !== seq.current) return;
      setRows((prev) => { const seen = new Set(prev.map((r) => r.id)); return [...prev, ...page.galleries.filter((r) => !seen.has(r.id))]; });
      setCursor(page.nextCursor);
    } catch { setError("Could not load more. Please try again."); } finally { setLoadingMore(false); }
  };

  const setDisabled = async (g: AdminGalleryRow, disabled: boolean, why = "") => {
    if (!user) return;
    setBusy(g.id); setMessage(null);
    try {
      const res = await fetch(`/api/admin/galleries/${g.id}/status`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ disabled, reason: why }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ kind: "error", text: data.error || "That did not work. Please try again." }); return; }
      setMessage({ kind: "ok", text: disabled ? `“${g.name}” is now switched off. Visitors see a “not available” page.` : `“${g.name}” is back on.` });
      setTarget(null); setReason("");
      await reload();
    } catch { setMessage({ kind: "error", text: "That did not work. Please try again." }); } finally { setBusy(null); }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>Galleries</h1>
        <p className="text-sm text-fg-muted mt-1">{total === null ? "Loading…" : `${total.toLocaleString("en-US")} galler${total === 1 ? "y" : "ies"}`} · find one by its link, open it, or switch it off.</p>
      </div>

      <div className="relative mb-4">
        <label htmlFor="gallery-search" className="sr-only">Search by link</label>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-muted" aria-hidden />
        <input id="gallery-search" type="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search by link, e.g. keller-wedding"
          className="w-full bg-surface-2 border border-line rounded-xl pl-9 pr-4 py-2.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-accent/60" />
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4" role="group" aria-label="Show">
        {([["all", "All"], ["disabled", `Switched off${disabledCount ? ` (${disabledCount})` : ""}`]] as [GalleryFilter, string][]).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key}
            className={`text-xs font-semibold px-3 py-1.5 rounded-pill border transition-colors ${filter === key ? "bg-accent text-canvas border-accent" : "bg-surface text-fg-muted border-line hover:text-fg hover:border-fg-muted/40"}`}>{label}</button>
        ))}
      </div>

      <div aria-live="polite">
        {message && <p role={message.kind === "error" ? "alert" : "status"} className={`mb-4 text-sm ${message.kind === "ok" ? "text-success-bright" : "text-danger"}`}>{message.text}</p>}
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-danger">{error} <button type="button" className="underline" onClick={() => void reload()}>Retry</button></p>}

      <div data-ui="galleries-list" aria-busy={loading} className="rounded-card border border-line bg-surface overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="py-16 flex justify-center"><div className="size-5 border-2 border-fg-muted/30 border-t-fg rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-fg-muted">{q ? `No gallery with a link starting “${q}”.` : filter === "disabled" ? "Nothing is switched off." : "No galleries yet."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((g) => (
              <li key={g.id} data-ui="gallery-row" className="px-4 py-3 grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_110px_auto] items-center gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span data-ui="gallery-name" className="text-sm font-semibold text-fg truncate">{g.name || "Untitled"}</span>
                    <span className={`${chip} border-line text-fg-muted`}>{g.visibility === "private" ? "Private" : "Public"}</span>
                    {!g.allowDownload && <span className={`${chip} border-line text-fg-muted`}>Downloads off</span>}
                    {g.disabled && <span className={`${chip} border-red-500/30 bg-red-500/10 text-danger`}>Switched off</span>}
                  </div>
                  <div className="text-xs text-fg-muted font-mono truncate">/gallery/{g.slug}</div>
                  {g.disabled && (g.disabledReason || g.disabledAt) && <div className="text-xs text-fg-muted mt-0.5">{g.disabledAt ? `Since ${formatDate(g.disabledAt)}` : ""}{g.disabledReason ? ` · ${g.disabledReason}` : ""}</div>}
                </div>
                <div className="min-w-0">
                  {g.owner ? (
                    <Link href={`/dashboard/admin/users?q=${encodeURIComponent(g.owner.email)}`} className="flex items-center gap-2 min-w-0 rounded-lg hover:bg-surface-2/60 -mx-1 px-1 py-0.5" title="Find this person in Users">
                      <Avatar src={g.owner.photoURL} name={g.owner.name || g.owner.email} size={28} />
                      <span className="min-w-0"><span className="block text-sm text-fg truncate">{g.owner.name || "—"}</span><span className="block text-xs text-fg-muted truncate">{g.owner.email}</span></span>
                    </Link>
                  ) : <span className="text-xs text-fg-muted">Owner not found</span>}
                </div>
                <div className="text-xs text-fg-muted md:text-right">{formatDate(g.updatedAt ?? g.createdAt)}<span className="block text-[11px]">{g.updatedAt ? "last edited" : "created"}</span></div>
                <div className="flex items-center gap-2 md:justify-end">
                  <a href={`/gallery/${g.slug}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${g.name || g.slug} in a new tab`} className="p-2 border border-line rounded-lg text-fg-muted hover:text-fg hover:border-fg-muted/40 transition-colors"><ExternalLink className="size-4" aria-hidden /></a>
                  {g.disabled
                    ? <Button size="sm" variant="outline" loading={busy === g.id} onClick={() => setDisabled(g, false)}>Switch on</Button>
                    : <Button size="sm" variant="danger" disabled={!!busy} onClick={() => { setTarget(g); setReason(""); setMessage(null); }}>Switch off</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {cursor && <div className="mt-5 flex justify-center"><Button variant="outline" size="sm" loading={loadingMore} onClick={loadMore}>Load more</Button></div>}
      {!cursor && rows.length > 0 && <p className="mt-4 text-center text-xs text-fg-muted">{rows.length.toLocaleString("en-US")} shown · end of list</p>}

      {target && (
        <Modal onClose={() => setTarget(null)} ariaLabel={`Switch off ${target.name}`} className="w-full max-w-md bg-surface border border-line rounded-card p-6 shadow-2xl">
          <h2 className="text-lg font-bold text-fg mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>Switch off “{target.name}”?</h2>
          <p className="text-sm text-fg-muted mb-4">Anyone opening <span className="font-mono">/gallery/{target.slug}</span> will see a polite “not available” page, and its photos, downloads and favourites stop working, for visitors and for the owner. Nothing is deleted; you can switch it back on at any time.</p>
          <label htmlFor="disable-reason" className="block text-xs text-fg-muted mb-1">Reason (for the team only, never shown to visitors)</label>
          <textarea id="disable-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} placeholder="e.g. Copyright complaint, 27 Nov" className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-accent/60 mb-4" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>Cancel</Button>
            <Button variant="danger" size="sm" loading={busy === target.id} onClick={() => setDisabled(target, true, reason)}>Switch off</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
