"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { CreateUserModal, CreatedUserPanel, type CreatedUser } from "@/components/admin/CreateUserModal";
import { UserDrawer, type PlanLite } from "@/components/admin/UserDrawer";
import { Avatar, StateBadge, accessState, flagLabel, formatDate } from "@/components/admin/admin-format";
import type { AdminUserRow, UserFilter } from "@/lib/server/repos/admin-users";

const FILTERS: { key: UserFilter; label: string; hint: string }[] = [
  { key: "all", label: "Everyone", hint: "Alphabetical by e-mail" },
  { key: "active", label: "Active", hint: "Access that has not ended, soonest end first" },
  { key: "expiring", label: "Expiring in 30 days", hint: "Soonest first; lifetime access is not listed" },
  { key: "lapsed", label: "Lapsed", hint: "Had access that has ended, most recent first" },
  { key: "comped", label: "Complimentary", hint: "Granted by an administrator" },
];

type Page = { users: AdminUserRow[]; nextCursor: string | null; total: number; needsBackfill: number };

/** Users (S7-05): a searchable, filterable, paged list. Search is by e-mail prefix; everything heavy happens on the server, a page at a time. */
export default function AdminUsersPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [needsBackfill, setNeedsBackfill] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanLite[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null);
  const seq = useRef(0);

  // Wait for the typing to pause before asking the server.
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const fetchPage = useCallback(async (after: string | null) => {
    if (!user) return null;
    const params = new URLSearchParams({ filter, limit: "25" });
    if (q) params.set("q", q);
    if (after) params.set("cursor", after);
    const res = await fetch(`/api/admin/users?${params}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Page;
  }, [user, filter, q]);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true); setError("");
    try {
      const page = await fetchPage(null);
      if (!page || mine !== seq.current) return;
      setRows(page.users); setCursor(page.nextCursor); setTotal(page.total); setNeedsBackfill(page.needsBackfill);
    } catch { if (mine === seq.current) setError("Could not load users. Please try again."); } finally { if (mine === seq.current) setLoading(false); }
  }, [fetchPage]);
  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((t) => fetch("/api/admin/plans", { headers: { Authorization: `Bearer ${t}` } })).then((r) => (r.ok ? r.json() : null)).then((d) => d && setPlans(d.plans)).catch(() => {});
  }, [user]);

  const loadMore = async () => {
    if (!cursor) return;
    const mine = seq.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage(cursor);
      if (!page || mine !== seq.current) return;
      setRows((prev) => { const seen = new Set(prev.map((r) => r.uid)); return [...prev, ...page.users.filter((r) => !seen.has(r.uid))]; });
      setCursor(page.nextCursor);
    } catch { setError("Could not load more. Please try again."); } finally { setLoadingMore(false); }
  };

  const onChanged = useCallback((row: AdminUserRow) => setRows((prev) => prev.map((r) => (r.uid === row.uid ? row : r))), []);
  const onDeleted = (uid: string) => { setRows((prev) => prev.filter((r) => r.uid !== uid)); setTotal((t) => (t === null ? t : Math.max(0, t - 1))); setOpen(null); };

  const hint = FILTERS.find((f) => f.key === filter)?.hint;

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-fg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>Users</h1>
          <p className="text-sm text-fg-muted mt-1">{total === null ? "Loading…" : `${total.toLocaleString("en-US")} account${total === 1 ? "" : "s"}`} · search, review access, assign plans.</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>New user</Button>
      </div>

      {needsBackfill > 0 && (
        <p role="status" className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200">
          {needsBackfill.toLocaleString("en-US")} {needsBackfill === 1 ? "account is" : "accounts are"} missing from this list and from search until their e-mail index is filled in. Run <code className="font-mono text-xs">scripts/migrations/backfill-email-lower.ts</code> (a dry run first).
        </p>
      )}

      <div className="relative mb-4">
        <label htmlFor="user-search" className="sr-only">Search by e-mail</label>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-muted" aria-hidden />
        <input id="user-search" type="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search by e-mail, e.g. anna@"
          className="w-full bg-surface-2 border border-line rounded-xl pl-9 pr-4 py-2.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-accent/60" />
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-2" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
            className={`text-xs font-semibold px-3 py-1.5 rounded-pill border transition-colors ${filter === f.key ? "bg-accent text-canvas border-accent" : "bg-surface text-fg-muted border-line hover:text-fg hover:border-fg-muted/40"}`}>{f.label}</button>
        ))}
      </div>
      <p className="text-xs text-fg-muted mb-4">{hint}{q && filter !== "all" ? " · filter applied to the matches" : ""}</p>

      {error && <p role="alert" className="mb-4 text-sm text-danger">{error} <button type="button" className="underline" onClick={() => void reload()}>Retry</button></p>}

      <div data-ui="users-list" aria-busy={loading} className="rounded-card border border-line bg-surface overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="py-16 flex justify-center"><div className="size-5 border-2 border-fg-muted/30 border-t-fg rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-fg-muted">{q ? `No one with an e-mail starting “${q}”.` : "No one here yet."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((u) => {
              const state = accessState(u);
              return (
                <li key={u.uid}>
                  <button type="button" onClick={() => setOpen(u.uid)} data-ui="user-row" aria-haspopup="dialog" className="w-full grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)_90px_110px] items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-surface-2/60 focus-visible:bg-surface-2/60 transition-colors">
                    <Avatar src={u.photoURL} name={u.displayName || u.email} />
                    <span className="min-w-0">
                      <span data-ui="user-name" className="block text-sm font-semibold text-fg truncate">{u.displayName || "—"}</span>
                      <span className="block text-xs text-fg-muted truncate">{u.email}</span>
                    </span>
                    <span className="md:order-none justify-self-end md:justify-self-start flex flex-col items-end md:items-start gap-1">
                      <StateBadge state={state} />
                      {u.paymentFlags.length > 0 && <span className="text-[11px] font-semibold text-amber-300">{flagLabel(u.paymentFlags[0])}</span>}
                    </span>
                    <span className="hidden md:block text-xs text-fg-muted text-right">{u.galleryCount} {u.galleryCount === 1 ? "gallery" : "galleries"}</span>
                    <span className="hidden md:block text-xs text-fg-muted text-right">{formatDate(u.createdAt)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {cursor && (
        <div className="mt-5 flex justify-center"><Button variant="outline" size="sm" loading={loadingMore} onClick={loadMore}>Load more</Button></div>
      )}
      {!cursor && rows.length > 0 && <p className="mt-4 text-center text-xs text-fg-muted">{rows.length.toLocaleString("en-US")} shown · end of list</p>}

      {open && <UserDrawer uid={open} plans={plans} onClose={() => setOpen(null)} onChanged={onChanged} onDeleted={onDeleted} />}
      {createOpen && <CreateUserModal plans={plans} onClose={() => setCreateOpen(false)} onCreated={(created) => { setCreateOpen(false); setCreatedUser(created); void reload(); }} />}
      {createdUser && <CreatedUserPanel created={createdUser} onClose={() => setCreatedUser(null)} />}
    </div>
  );
}
