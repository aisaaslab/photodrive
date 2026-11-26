"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CreateUserModal, CreatedUserPanel, type CreatedUser } from "@/components/admin/CreateUserModal";
import type { PlanDoc } from "@/lib/firestore/types";
import { formatMoney } from "@/lib/shared/money";
import type { PaymentFlag } from "@/lib/access-source";

type Photographer = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  createdAt: string;
  lastSignIn: string;
  galleryCount: number;
  lastGalleryAt: number | null;
  subscriptionActive: boolean;
  subscriptionExpiresAt: number | null;
  compGranted: boolean;
  // How they got access: admin grant, a 100%-off Stripe code, or a real payment.
  accessSource: "admin" | "free_code" | "paid" | null;
  promoCode: string | null;
  lastPaymentCents: number | null;
  lastPaymentCurrency: string | null;
  planId: string | null;
  planName: string | null;
  planInterval: string | null;
  // Refunded / disputed / needs-review payments, worst first (S2-09).
  paymentFlags: PaymentFlag[];
};

type Gallery = {
  id: string;
  name: string;
  slug: string;
  folderId: string;
  passwordHash: string | null;
  password: string | null;
  visibility?: "public" | "private";
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  createdAt: number;
  updatedAt: number;
  photographerId: string;
  photographer: { email: string; displayName: string; photoURL?: string } | null;
};

type PlanLite = Pick<PlanDoc, "id" | "name" | "interval" | "priceCents" | "currency" | "active" | "isPublic">;

type SourceFilter = "all" | "free_code" | "paid" | "admin" | "none";

/** Operator-facing wording for a flagged payment (S2-09). */
const flagLabel = (f: Pick<PaymentFlag, "status" | "needsReview">) =>
  f.status === "refunded" ? "Refunded"
    : f.status === "partially_refunded" ? "Partially refunded"
      : f.status === "disputed" ? "Disputed"
        : f.status === "dispute_lost" ? "Dispute lost"
          : "Needs review";
const flagStyle = (f: Pick<PaymentFlag, "status">) =>
  f.status === "dispute_lost" || f.status === "disputed" ? "bg-red-500/10 text-danger border-red-500/20" : "bg-amber-500/10 text-amber-300 border-amber-500/20";

const SOURCE_LABEL: Record<"admin" | "free_code" | "paid", string> = {
  admin: "Admin grant",
  free_code: "Free code",
  paid: "Paid",
};

const SOURCE_STYLE: Record<"admin" | "free_code" | "paid", string> = {
  admin: "bg-accent-deep/10 text-accent border-accent-deep/30",
  free_code: "bg-amber-500/10 text-amber-300 border-amber-500/25",
  paid: "bg-surface-2 text-fg-soft border-line",
};

function formatPaid(cents: number | null, currency: string | null) {
  return cents === null ? "—" : formatMoney(cents, currency ?? "usd", "en-US");
}

function formatDate(ts: number | string | null | undefined) {
  if (!ts) return "—";
  const d = new Date(typeof ts === "number" ? ts : ts);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const AVATAR_SIZES: Record<number, string> = {
  6: "w-6 h-6",
  7: "w-7 h-7",
  8: "w-8 h-8",
  9: "w-9 h-9",
};

function Avatar({ src, name, size = 7 }: { src?: string | null; name: string; size?: number }) {
  const initials = name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  const dims = AVATAR_SIZES[size] ?? AVATAR_SIZES[7];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={`${dims} rounded-full ring-1 ring-line object-cover`} />;
  }
  return (
    <div className={`${dims} rounded-full bg-accent-deep/20 flex items-center justify-center text-xs font-bold text-accent ring-1 ring-accent-deep/20`}>
      {initials}
    </div>
  );
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<Photographer[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [plans, setPlans] = useState<PlanLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "name" | "lastSignIn">("newest");
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [issuesOnly, setIssuesOnly] = useState(false);

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editVisibility, setEditVisibility] = useState<"public" | "private">("public");
  const [editError, setEditError] = useState("");
  const [editDriveUrl, setEditDriveUrl] = useState("");
  const [editSocial, setEditSocial] = useState({ website: "", instagram: "", facebook: "" });
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // User delete state (hard delete — works directly, no revoke needed first)
  const [userDeleteConfirm, setUserDeleteConfirm] = useState<string | null>(null);
  const [userDeletingId, setUserDeletingId] = useState<string | null>(null);

  // Subscription / access management
  const [subBusy, setSubBusy] = useState<string | null>(null);
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null);
  const [subMessage, setSubMessage] = useState<Record<string, { kind: "ok" | "error"; text: string }>>({});
  const [planSelect, setPlanSelect] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const headers = { Authorization: `Bearer ${token}` };
    const [usersRes, galleriesRes, plansRes] = await Promise.all([
      fetch("/api/admin/users", { headers }),
      fetch("/api/admin/galleries", { headers }),
      fetch("/api/admin/plans", { headers }),
    ]);
    if (usersRes.ok) setUsers((await usersRes.json()).users);
    if (galleriesRes.ok) setGalleries((await galleriesRes.json()).galleries);
    if (plansRes.ok) setPlans((await plansRes.json()).plans);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const startEdit = (g: Gallery) => {
    setEditingId(g.id);
    setEditName(g.name);
    setEditPassword(g.password ?? "");
    setEditVisibility(g.visibility ?? (g.passwordHash ? "private" : "public"));
    setEditError("");
    setEditDriveUrl(`https://drive.google.com/drive/folders/${g.folderId}`);
    setEditSocial({ website: g.website ?? "", instagram: g.instagram ?? "", facebook: g.facebook ?? "" });
  };

  const saveEdit = async (id: string) => {
    if (!user) return;
    setEditSaving(true);
    const token = await user.getIdToken();
    const body: Record<string, unknown> = { name: editName };
    if (editDriveUrl) body.driveUrl = editDriveUrl;
    // Public or private (D18): a private gallery needs a password, a public one has none.
    body.visibility = editVisibility;
    const current = galleries.find((x) => x.id === id);
    if (editVisibility === "private" && editPassword && editPassword !== current?.password) body.password = editPassword;
    body.website = editSocial.website.trim();
    body.instagram = editSocial.instagram.trim();
    body.facebook = editSocial.facebook.trim();
    const res = await fetch(`/api/admin/galleries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      setGalleries((prev) => prev.map((g) => (g.id === id ? { ...g, ...updated } : g)));
      setEditingId(null);
    } else {
      setEditError((await res.json().catch(() => null))?.error ?? "Could not save");
    }
    setEditSaving(false);
  };

  const deleteGallery = async (id: string) => {
    if (!user) return;
    setDeletingId(id);
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/galleries/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setGalleries((prev) => prev.filter((g) => g.id !== id));
      setDeleteConfirm(null);
    }
    setDeletingId(null);
  };

  const setSubscription = async (uid: string, action: "assign_plan" | "grant_lifetime" | "grant_year" | "revoke", planId?: string) => {
    if (!user) return;
    setSubBusy(uid);
    setSubMessage((prev) => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid, action, planId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubMessage((prev) => ({ ...prev, [uid]: { kind: "error", text: data.error || "Action failed. Please try again." } }));
        return;
      }
      await loadData();
      const labels: Record<string, string> = {
        assign_plan: "Plan assigned — subscription is now active.",
        grant_lifetime: "Lifetime access granted.",
        grant_year: "+1 year of access granted.",
        revoke: "Access revoked — account kept, subscription removed.",
      };
      setSubMessage((prev) => ({ ...prev, [uid]: { kind: "ok", text: labels[action] ?? "Done." } }));
      if (action === "revoke") setRevokeConfirm(null);
    } catch {
      setSubMessage((prev) => ({ ...prev, [uid]: { kind: "error", text: "Action failed. Please try again." } }));
    } finally {
      setSubBusy(null);
    }
  };

  const deleteUser = async (uid: string) => {
    if (!user) return;
    setUserDeletingId(uid);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubMessage((prev) => ({ ...prev, [uid]: { kind: "error", text: data.error || "Could not delete the user." } }));
        return;
      }
      setUsers((prev) => prev.filter((u) => u.uid !== uid));
      setGalleries((prev) => prev.filter((g) => g.photographerId !== uid));
      setUserDeleteConfirm(null);
      if (expandedUid === uid) setExpandedUid(null);
    } catch {
      setSubMessage((prev) => ({ ...prev, [uid]: { kind: "error", text: "Could not delete the user." } }));
    } finally {
      setUserDeletingId(null);
    }
  };

  // Mark a flagged payment as reviewed (S2-16): it stops being flagged and drops out of the daily digest.
  const markPaymentReviewed = async (uid: string, sessionId: string) => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/review", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind: "payment", id: sessionId }),
    });
    if (res.ok || res.status === 409) {
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, paymentFlags: u.paymentFlags.map((f) => (f.sessionId === sessionId ? { ...f, needsReview: false } : f)) } : u)),
      );
    }
  };

  const galleriesFor = (uid: string) => galleries.filter((g) => g.photographerId === uid);

  const sourceCounts = {
    all: users.length,
    free_code: users.filter((u) => u.accessSource === "free_code").length,
    paid: users.filter((u) => u.accessSource === "paid").length,
    admin: users.filter((u) => u.accessSource === "admin").length,
    none: users.filter((u) => !u.accessSource).length,
  };

  const issueCount = users.filter((u) => u.paymentFlags.length > 0).length;

  const filteredUsers = users.filter((u) => {
    if (issuesOnly && u.paymentFlags.length === 0) return false;
    if (sourceFilter === "none" ? !!u.accessSource : sourceFilter !== "all" && u.accessSource !== sourceFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const userMatch =
      u.email.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q) ||
      (u.promoCode ?? "").toLowerCase().includes(q);
    const galleryMatch = galleriesFor(u.uid).some((g) => g.name.toLowerCase().includes(q));
    return userMatch || galleryMatch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-5 h-5 border-2 border-fg-muted/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const tsOf = (s: string) => { const t = new Date(s).getTime(); return Number.isNaN(t) ? 0 : t; };

  // Default: most recent registrations on top.
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    switch (sort) {
      case "oldest": return tsOf(a.createdAt) - tsOf(b.createdAt);
      case "name": return (a.displayName || a.email).localeCompare(b.displayName || b.email, "en");
      case "lastSignIn": return tsOf(b.lastSignIn) - tsOf(a.lastSignIn);
      default: return tsOf(b.createdAt) - tsOf(a.createdAt);
    }
  });

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-fg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
            Users
          </h1>
          <p className="text-sm text-fg-muted mt-1">
            {users.length} account{users.length === 1 ? "" : "s"} · create accounts, assign plans, manage galleries.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="shrink-0 flex items-center gap-2 bg-accent-deep text-fg text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-accent-deep transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 010.75 19.235z" />
          </svg>
          New user
        </button>
      </div>

      {/* Search + sort */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search photographer, email, gallery, promo code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-2 border border-line rounded-xl pl-9 pr-4 py-2.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-fg-muted/30"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="bg-surface border border-line rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:border-fg-muted/30 cursor-pointer shrink-0"
        >
          <option value="newest">Newest sign-ups</option>
          <option value="oldest">Oldest sign-ups</option>
          <option value="lastSignIn">Last sign-in</option>
          <option value="name">Name (A-Z)</option>
        </select>
      </div>

      {/* Filter by how people got access — e.g. everyone who used a free code */}
      <div className="flex items-center gap-2 flex-wrap mb-6" role="group" aria-label="Filter by access type">
        {([
          ["all", "All"],
          ["free_code", "Free code"],
          ["paid", "Paid"],
          ["admin", "Admin grant"],
          ["none", "No plan"],
        ] as [SourceFilter, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSourceFilter(key)}
            aria-pressed={sourceFilter === key}
            className={`text-xs font-semibold px-3 py-1.5 rounded-pill border transition-colors ${
              sourceFilter === key
                ? "bg-accent text-canvas border-white"
                : "bg-surface text-fg-muted border-line hover:text-fg hover:border-fg-muted/30"
            }`}
          >
            {label} <span className={sourceFilter === key ? "text-fg-muted" : "text-fg-muted"}>{sourceCounts[key]}</span>
          </button>
        ))}
        {/* Customers with a refunded, disputed or flagged payment (S2-09) */}
        <button
          onClick={() => setIssuesOnly((v) => !v)}
          aria-pressed={issuesOnly}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ml-auto ${
            issuesOnly
              ? "bg-amber-400 text-stone-900 border-amber-400"
              : "bg-surface text-amber-300 border-amber-500/20 hover:border-amber-500/40"
          }`}
        >
          Payment issues <span className={issuesOnly ? "text-stone-700" : "text-amber-400/70"}>{issueCount}</span>
        </button>
      </div>

      {/* Photographers list */}
      <div className="space-y-3">
        {sortedUsers.length === 0 && (
          <div className="text-center py-16 text-fg-muted">No results found</div>
        )}
        {sortedUsers.map((u) => {
          const userGalleries = galleriesFor(u.uid);
          const isExpanded = expandedUid === u.uid;
          const selectedPlan = planSelect[u.uid] ?? "";

          return (
            <div key={u.uid} className="bg-surface border border-line rounded-card overflow-hidden">
              {/* Photographer row */}
              <button
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface transition-colors text-left"
                onClick={() => setExpandedUid(isExpanded ? null : u.uid)}
              >
                <Avatar src={u.photoURL} name={u.displayName || u.email} size={9} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-fg text-sm" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
                      {u.displayName || "—"}
                    </span>
                    <span className="text-xs text-fg-muted">{u.email}</span>
                  </div>
                  <div className="text-xs text-fg-muted mt-0.5">
                    Joined: {formatDate(u.createdAt)} · Last sign-in: {formatDate(u.lastSignIn)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {u.subscriptionActive ? (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-success-bright border border-emerald-500/20">
                      ✓ {u.planName ? `${u.planName} (${u.planInterval})` : "Active"} {u.subscriptionExpiresAt ? (u.subscriptionExpiresAt > 4102444800000 ? "· lifetime" : `until ${formatDate(u.subscriptionExpiresAt)}`) : ""}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-surface text-fg-muted border border-line">
                      No subscription
                    </span>
                  )}
                  {u.accessSource && (
                    <span
                      title={
                        u.accessSource === "free_code"
                          ? `Signed up with a 100%-off code${u.promoCode ? ` (${u.promoCode})` : ""}`
                          : u.accessSource === "paid"
                            ? `Paid ${formatPaid(u.lastPaymentCents, u.lastPaymentCurrency)} via Stripe`
                            : "Access granted by an admin"
                      }
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${SOURCE_STYLE[u.accessSource]}`}
                    >
                      {SOURCE_LABEL[u.accessSource]}{u.accessSource === "free_code" && u.promoCode ? ` · ${u.promoCode}` : ""}
                    </span>
                  )}
                  {u.paymentFlags.length > 0 && (
                    <span
                      title={u.paymentFlags.map((f) => f.reviewNote ?? flagLabel(f)).join("\n")}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${flagStyle(u.paymentFlags[0])}`}
                    >
                      {flagLabel(u.paymentFlags[0])}{u.paymentFlags.length > 1 ? ` +${u.paymentFlags.length - 1}` : ""}
                    </span>
                  )}
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${userGalleries.length > 0 ? "bg-accent-deep/10 text-accent border border-accent-deep/20" : "bg-surface text-fg-muted border border-line"}`}>
                    {userGalleries.length} {userGalleries.length === 1 ? "gallery" : "galleries"}
                  </span>
                  <svg
                    className={`w-4 h-4 text-fg-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </button>

              {/* Expanded section */}
              {isExpanded && (
                <div className="border-t border-line">
                  {/* Payment issues: refunded, disputed or flagged for review (S2-09) */}
                  {u.paymentFlags.length > 0 && (
                    <div className="px-5 py-4 border-b border-line bg-amber-500/[0.03]">
                      <p className="text-xs font-semibold text-amber-300 mb-2">Payment issues</p>
                      <ul className="space-y-1.5">
                        {u.paymentFlags.map((f) => (
                          <li key={f.sessionId} className="text-xs text-fg-soft">
                            <span className={`inline-block font-semibold px-2 py-0.5 rounded-full border mr-2 ${flagStyle(f)}`}>{flagLabel(f)}</span>
                            {f.amountTotal !== null && <>{formatPaid(f.amountTotal, f.currency)}</>}
                            {f.refundedAmount !== null && f.refundedAmount > 0 && <> · refunded {formatPaid(f.refundedAmount, f.currency)}</>}
                            {f.activatedAt > 0 && <> · {formatDate(f.activatedAt)}</>}
                            {f.needsReview && f.status !== "fulfilled" && <span className="text-amber-300"> · needs review</span>}
                            <span className="block text-fg-muted font-mono mt-0.5">{f.sessionId}</span>
                            {f.reviewNote && <span className="block text-fg-muted mt-0.5">{f.reviewNote}</span>}
                            {f.needsReview && (
                              <button
                                type="button"
                                onClick={() => markPaymentReviewed(u.uid, f.sessionId)}
                                className="mt-1 text-xs font-semibold text-amber-300 underline underline-offset-2 hover:text-amber-200"
                              >
                                Mark reviewed
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Subscription / access control */}
                  <div className="px-5 py-4 border-b border-line">
                    {u.accessSource && (
                      <p className="text-xs text-fg-muted mb-3">
                        <span className="text-fg-muted">How they got access:</span>{" "}
                        <span className="text-fg font-medium">{SOURCE_LABEL[u.accessSource]}</span>
                        {u.accessSource === "free_code" && u.promoCode && <> · code <span className="font-mono text-amber-300">{u.promoCode}</span></>}
                        {u.accessSource !== "admin" && u.lastPaymentCents !== null && <> · charged {formatPaid(u.lastPaymentCents, u.lastPaymentCurrency)}</>}
                        {u.planName && <> · {u.planName}{u.planInterval ? ` (${u.planInterval})` : ""}</>}
                        {u.subscriptionExpiresAt ? <> · {u.subscriptionExpiresAt > 4102444800000 ? "lifetime" : `ends ${formatDate(u.subscriptionExpiresAt)}`}</> : null}
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-fg-muted mr-1">Access / Subscription:</span>
                      <select
                        value={selectedPlan}
                        onChange={(e) => setPlanSelect((prev) => ({ ...prev, [u.uid]: e.target.value }))}
                        className="bg-surface border border-line rounded-lg px-2.5 py-1.5 text-xs text-fg focus:outline-none focus:border-fg-muted/30 cursor-pointer"
                      >
                        <option value="">Choose plan…</option>
                        {plans.map((p) => (
                          <option key={p.id} value={p.id} disabled={!p.active}>
                            {p.name} · {p.interval} · {formatMoney(p.priceCents, p.currency, "en-US")}{p.active ? "" : " (inactive — activate in Plans tab)"}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => selectedPlan && setSubscription(u.uid, "assign_plan", selectedPlan)}
                        disabled={subBusy === u.uid || !selectedPlan}
                        title="Activates the chosen plan on this account immediately"
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent-deep text-fg hover:bg-accent-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Assign plan
                      </button>
                      <span className="w-px h-4 bg-surface-2" />
                      <button
                        onClick={() => setSubscription(u.uid, "grant_lifetime")}
                        disabled={subBusy === u.uid}
                        title="Grants complimentary lifetime access"
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-accent-deep/40 text-accent hover:border-accent-deep disabled:opacity-50 transition-colors"
                      >
                        Free lifetime
                      </button>
                      <button
                        onClick={() => setSubscription(u.uid, "grant_year")}
                        disabled={subBusy === u.uid}
                        title="Grants complimentary access for one year"
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-accent-deep/40 text-accent hover:border-accent-deep disabled:opacity-50 transition-colors"
                      >
                        +1 year
                      </button>
                      {revokeConfirm === u.uid ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs text-danger">Remove access?</span>
                          <button
                            onClick={() => setSubscription(u.uid, "revoke")}
                            disabled={subBusy === u.uid}
                            title="Removes the subscription — the account stays, premium access goes"
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-red-500/10 border border-red-500/30 text-danger hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                          >
                            {subBusy === u.uid ? "..." : "Yes, revoke"}
                          </button>
                          <button
                            onClick={() => setRevokeConfirm(null)}
                            className="px-2.5 py-1.5 border border-line text-fg-muted text-xs rounded-lg"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setRevokeConfirm(u.uid)}
                          disabled={subBusy === u.uid}
                          title="Removes the subscription — the account stays, premium access goes"
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-500/30 text-danger hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                        >
                          Revoke access
                        </button>
                      )}
                      {subBusy === u.uid && (
                        <span className="w-4 h-4 border-2 border-fg-muted/30 border-t-white rounded-full animate-spin" />
                      )}
                    </div>
                    <p className="text-[11px] text-fg-muted mt-2">
                      Revoke removes premium access but keeps the account. Deleting (below) removes the account, its subscription and its galleries permanently.
                    </p>
                    {subMessage[u.uid] && (
                      <p className={`text-xs mt-2 ${subMessage[u.uid].kind === "ok" ? "text-success-bright" : "text-danger"}`}>
                        {subMessage[u.uid].kind === "ok" ? "✓ " : ""}{subMessage[u.uid].text}
                      </p>
                    )}
                    {plans.length === 0 && (
                      <p className="text-[11px] text-fg-muted mt-2">
                        No payment plans yet — create one in the Plans tab to assign it here.
                      </p>
                    )}
                  </div>
                  {userGalleries.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-fg-muted">No galleries yet.</div>
                  ) : (
                    <div className="divide-y divide-white/[0.04]">
                      {userGalleries.map((g) => (
                        <div key={g.id} className="px-5 py-4">
                          {editingId === g.id ? (
                            /* Edit form */
                            <div className="space-y-3">
                              <div className="grid sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs text-fg-muted mb-1">Name</label>
                                  <input
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-fg-muted/30"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-fg-muted mb-1">Visibility</label>
                                  <select
                                    value={editVisibility}
                                    onChange={(e) => setEditVisibility(e.target.value as "public" | "private")}
                                    className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-fg-muted/30"
                                  >
                                    <option value="public">Public (no password)</option>
                                    <option value="private">Private (password required)</option>
                                  </select>
                                  {editVisibility === "private" && (
                                    <input
                                      value={editPassword}
                                      onChange={(e) => setEditPassword(e.target.value)}
                                      placeholder="Password (required)"
                                      maxLength={200}
                                      className="mt-2 w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-fg-muted/30"
                                    />
                                  )}
                                  {editVisibility === "public" && g.passwordHash && (
                                    <p className="mt-1 text-xs text-amber-300">Saving as public removes this gallery&apos;s password.</p>
                                  )}
                                  {editError && <p className="mt-1 text-xs text-danger">{editError}</p>}
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs text-fg-muted mb-1">Google Drive URL</label>
                                <input
                                  value={editDriveUrl}
                                  onChange={(e) => setEditDriveUrl(e.target.value)}
                                  className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-fg font-mono text-xs focus:outline-none focus:border-fg-muted/30"
                                />
                              </div>
                              <div className="grid sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-xs text-fg-muted mb-1">Website</label>
                                  <input
                                    value={editSocial.website}
                                    onChange={(e) => setEditSocial((s) => ({ ...s, website: e.target.value }))}
                                    placeholder="https://..."
                                    className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-fg-muted/30"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-fg-muted mb-1">Instagram</label>
                                  <input
                                    value={editSocial.instagram}
                                    onChange={(e) => setEditSocial((s) => ({ ...s, instagram: e.target.value }))}
                                    placeholder="https://instagram.com/..."
                                    className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-fg-muted/30"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-fg-muted mb-1">Facebook</label>
                                  <input
                                    value={editSocial.facebook}
                                    onChange={(e) => setEditSocial((s) => ({ ...s, facebook: e.target.value }))}
                                    placeholder="https://facebook.com/..."
                                    className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-fg-muted/30"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => saveEdit(g.id)}
                                  disabled={editSaving}
                                  className="px-4 py-2 bg-accent text-canvas text-sm font-semibold rounded-pill hover:brightness-110 disabled:opacity-50 transition-colors"
                                >
                                  {editSaving ? "Saving..." : "Save"}
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="px-4 py-2 border border-line text-fg-muted text-sm rounded-lg hover:text-fg transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Gallery row */
                            <div className="flex items-center gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-fg text-sm">{g.name}</span>
                                  {!g.passwordHash && (
                                    <span className="text-xs bg-black/40 border border-line text-fg-muted px-2 py-0.5 rounded-full">Public</span>
                                  )}
                                  {g.passwordHash && (
                                    <span className="text-xs bg-black/40 border border-line text-fg-muted px-2 py-0.5 rounded-full flex items-center gap-1">
                                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                      </svg>
                                      {g.password || "password"}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-fg-muted mt-0.5 font-mono">/gallery/{g.slug} · {formatDate(g.createdAt)}</div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {/* View */}
                                <a
                                  href={`/gallery/${g.slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 border border-line rounded-lg text-fg-muted hover:text-fg hover:border-fg-muted/30 transition-colors"
                                  title="View gallery"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                  </svg>
                                </a>
                                {/* Drive */}
                                <a
                                  href={`https://drive.google.com/drive/folders/${g.folderId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 border border-line rounded-lg text-fg-muted hover:text-fg hover:border-fg-muted/30 transition-colors"
                                  title="Drive folder"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                                  </svg>
                                </a>
                                {/* Edit */}
                                <button
                                  onClick={() => startEdit(g)}
                                  className="p-1.5 border border-line rounded-lg text-fg-muted hover:text-fg hover:border-fg-muted/30 transition-colors"
                                  title="Edit"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                                  </svg>
                                </button>
                                {/* Delete */}
                                {deleteConfirm === g.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-danger">Sure?</span>
                                    <button
                                      onClick={() => deleteGallery(g.id)}
                                      disabled={deletingId === g.id}
                                      className="px-2 py-1 bg-red-500/10 border border-red-500/30 text-danger text-xs rounded-lg hover:bg-red-500/20 disabled:opacity-50"
                                    >
                                      {deletingId === g.id ? "..." : "Yes"}
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirm(null)}
                                      className="px-2 py-1 border border-line text-fg-muted text-xs rounded-lg"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirm(g.id)}
                                    className="p-1.5 border border-line rounded-lg text-fg-muted hover:text-danger hover:border-red-500/30 transition-colors"
                                    title="Delete"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Danger zone: permanent user delete */}
                  <div className="px-5 py-4 border-t border-red-500/10 bg-red-500/[0.02] flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-xs font-semibold text-danger">Delete user permanently</p>
                      <p className="text-[11px] text-fg-muted mt-0.5">
                        Removes the account, its subscription and {userGalleries.length} {userGalleries.length === 1 ? "gallery" : "galleries"}. No need to revoke first. Cannot be undone.
                      </p>
                    </div>
                    {userDeleteConfirm === u.uid ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-danger">Sure?</span>
                        <button
                          onClick={() => deleteUser(u.uid)}
                          disabled={userDeletingId === u.uid}
                          className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-danger text-xs font-semibold rounded-lg hover:bg-red-500/20 disabled:opacity-50"
                        >
                          {userDeletingId === u.uid ? "Deleting..." : "Yes, delete"}
                        </button>
                        <button
                          onClick={() => setUserDeleteConfirm(null)}
                          className="px-3 py-1.5 border border-line text-fg-muted text-xs rounded-lg"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setUserDeleteConfirm(u.uid)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-500/30 text-danger hover:bg-red-500/10 transition-colors"
                      >
                        Delete user…
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {createOpen && (
        <CreateUserModal
          plans={plans}
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            setCreateOpen(false);
            setCreatedUser(created);
            loadData();
          }}
        />
      )}
      {createdUser && (
        <CreatedUserPanel created={createdUser} onClose={() => setCreatedUser(null)} />
      )}
    </div>
  );
}
