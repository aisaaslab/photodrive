"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CreateUserModal, CreatedUserPanel, type CreatedUser } from "@/components/admin/CreateUserModal";
import type { PlanDoc } from "@/lib/firestore/types";

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
  planId: string | null;
  planName: string | null;
  planInterval: string | null;
};

type Gallery = {
  id: string;
  name: string;
  slug: string;
  folderId: string;
  passwordHash: string | null;
  password: string | null;
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  createdAt: number;
  updatedAt: number;
  photographerId: string;
  photographer: { email: string; displayName: string; photoURL?: string } | null;
};

type PlanLite = Pick<PlanDoc, "id" | "name" | "interval" | "priceCents" | "active" | "isPublic">;

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
    return <img src={src} alt={name} className={`${dims} rounded-full ring-1 ring-white/10 object-cover`} />;
  }
  return (
    <div className={`${dims} rounded-full bg-[#17509e]/20 flex items-center justify-center text-xs font-bold text-[#2dabe0] ring-1 ring-[#17509e]/20`}>
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

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editDriveUrl, setEditDriveUrl] = useState("");
  const [editSocial, setEditSocial] = useState({ website: "", instagram: "", facebook: "" });
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Subscription / access management
  const [subBusy, setSubBusy] = useState<string | null>(null);
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
    setEditDriveUrl(`https://drive.google.com/drive/folders/${g.folderId}`);
    setEditSocial({ website: g.website ?? "", instagram: g.instagram ?? "", facebook: g.facebook ?? "" });
  };

  const saveEdit = async (id: string) => {
    if (!user) return;
    setEditSaving(true);
    const token = await user.getIdToken();
    const body: Record<string, unknown> = { name: editName };
    if (editDriveUrl) body.driveUrl = editDriveUrl;
    if (editPassword) body.password = editPassword;
    else body.removePassword = true;
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
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ uid, action, planId }),
    });
    if (res.ok) await loadData();
    setSubBusy(null);
  };

  const galleriesFor = (uid: string) => galleries.filter((g) => g.photographerId === uid);

  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const userMatch = u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q);
    const galleryMatch = galleriesFor(u.uid).some((g) => g.name.toLowerCase().includes(q));
    return userMatch || galleryMatch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
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
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
            Users
          </h1>
          <p className="text-sm text-stone-400 mt-1">
            {users.length} account{users.length === 1 ? "" : "s"} · create accounts, assign plans, manage galleries.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="shrink-0 flex items-center gap-2 bg-[#17509e] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-[#103a75] transition-colors"
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
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search photographer, email, gallery..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-white/20"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="bg-[#111111] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/20 cursor-pointer shrink-0"
        >
          <option value="newest">Newest sign-ups</option>
          <option value="oldest">Oldest sign-ups</option>
          <option value="lastSignIn">Last sign-in</option>
          <option value="name">Name (A-Z)</option>
        </select>
      </div>

      {/* Photographers list */}
      <div className="space-y-3">
        {sortedUsers.length === 0 && (
          <div className="text-center py-16 text-stone-500">No results found</div>
        )}
        {sortedUsers.map((u) => {
          const userGalleries = galleriesFor(u.uid);
          const isExpanded = expandedUid === u.uid;
          const selectedPlan = planSelect[u.uid] ?? "";

          return (
            <div key={u.uid} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
              {/* Photographer row */}
              <button
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors text-left"
                onClick={() => setExpandedUid(isExpanded ? null : u.uid)}
              >
                <Avatar src={u.photoURL} name={u.displayName || u.email} size={9} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-sm" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
                      {u.displayName || "—"}
                    </span>
                    <span className="text-xs text-stone-500">{u.email}</span>
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    Joined: {formatDate(u.createdAt)} · Last sign-in: {formatDate(u.lastSignIn)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {u.subscriptionActive ? (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      ✓ {u.planName ? `${u.planName} (${u.planInterval})` : "Active"} {u.subscriptionExpiresAt ? (u.subscriptionExpiresAt > 4102444800000 ? "· lifetime" : `until ${formatDate(u.subscriptionExpiresAt)}`) : ""}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/[0.04] text-stone-500 border border-white/[0.06]">
                      No subscription
                    </span>
                  )}
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${userGalleries.length > 0 ? "bg-[#17509e]/10 text-[#2dabe0] border border-[#17509e]/20" : "bg-white/[0.04] text-stone-500 border border-white/[0.06]"}`}>
                    {userGalleries.length} {userGalleries.length === 1 ? "gallery" : "galleries"}
                  </span>
                  <svg
                    className={`w-4 h-4 text-stone-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </button>

              {/* Expanded section */}
              {isExpanded && (
                <div className="border-t border-white/[0.06]">
                  {/* Subscription / access control */}
                  <div className="px-5 py-4 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-stone-400 mr-1">Access / Subscription:</span>
                      <select
                        value={selectedPlan}
                        onChange={(e) => setPlanSelect((prev) => ({ ...prev, [u.uid]: e.target.value }))}
                        className="bg-[#111111] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white/20 cursor-pointer"
                      >
                        <option value="">Choose plan…</option>
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.interval} · ${(p.priceCents / 100).toFixed(2)}{p.active ? "" : " (inactive)"}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => selectedPlan && setSubscription(u.uid, "assign_plan", selectedPlan)}
                        disabled={subBusy === u.uid || !selectedPlan}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#17509e] text-white hover:bg-[#103a75] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Assign plan
                      </button>
                      <span className="w-px h-4 bg-white/10" />
                      <button
                        onClick={() => setSubscription(u.uid, "grant_lifetime")}
                        disabled={subBusy === u.uid}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#17509e]/40 text-[#2dabe0] hover:border-[#17509e] disabled:opacity-50 transition-colors"
                      >
                        Free lifetime
                      </button>
                      <button
                        onClick={() => setSubscription(u.uid, "grant_year")}
                        disabled={subBusy === u.uid}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#17509e]/40 text-[#2dabe0] hover:border-[#17509e] disabled:opacity-50 transition-colors"
                      >
                        +1 year
                      </button>
                      <button
                        onClick={() => setSubscription(u.uid, "revoke")}
                        disabled={subBusy === u.uid}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                      >
                        Revoke
                      </button>
                      {subBusy === u.uid && (
                        <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      )}
                    </div>
                    {plans.length === 0 && (
                      <p className="text-[11px] text-stone-600 mt-2">
                        No payment plans yet — create one in the Plans tab to assign it here.
                      </p>
                    )}
                  </div>
                  {userGalleries.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-stone-500">No galleries yet.</div>
                  ) : (
                    <div className="divide-y divide-white/[0.04]">
                      {userGalleries.map((g) => (
                        <div key={g.id} className="px-5 py-4">
                          {editingId === g.id ? (
                            /* Edit form */
                            <div className="space-y-3">
                              <div className="grid sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs text-stone-400 mb-1">Name</label>
                                  <input
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/25"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-stone-400 mb-1">Password (empty = none)</label>
                                  <input
                                    value={editPassword}
                                    onChange={(e) => setEditPassword(e.target.value)}
                                    placeholder="Leave empty to remove"
                                    className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-white/25"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs text-stone-400 mb-1">Google Drive URL</label>
                                <input
                                  value={editDriveUrl}
                                  onChange={(e) => setEditDriveUrl(e.target.value)}
                                  className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono text-xs focus:outline-none focus:border-white/25"
                                />
                              </div>
                              <div className="grid sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-xs text-stone-400 mb-1">Website</label>
                                  <input
                                    value={editSocial.website}
                                    onChange={(e) => setEditSocial((s) => ({ ...s, website: e.target.value }))}
                                    placeholder="https://..."
                                    className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-white/25"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-stone-400 mb-1">Instagram</label>
                                  <input
                                    value={editSocial.instagram}
                                    onChange={(e) => setEditSocial((s) => ({ ...s, instagram: e.target.value }))}
                                    placeholder="https://instagram.com/..."
                                    className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-white/25"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-stone-400 mb-1">Facebook</label>
                                  <input
                                    value={editSocial.facebook}
                                    onChange={(e) => setEditSocial((s) => ({ ...s, facebook: e.target.value }))}
                                    placeholder="https://facebook.com/..."
                                    className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-white/25"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => saveEdit(g.id)}
                                  disabled={editSaving}
                                  className="px-4 py-2 bg-white text-stone-900 text-sm font-semibold rounded-lg hover:bg-stone-100 disabled:opacity-50 transition-colors"
                                >
                                  {editSaving ? "Saving..." : "Save"}
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="px-4 py-2 border border-white/10 text-stone-400 text-sm rounded-lg hover:text-white transition-colors"
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
                                  <span className="font-medium text-white text-sm">{g.name}</span>
                                  {g.passwordHash && (
                                    <span className="text-xs bg-black/40 border border-white/10 text-stone-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                      </svg>
                                      {g.password || "password"}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-stone-500 mt-0.5 font-mono">/gallery/{g.slug} · {formatDate(g.createdAt)}</div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {/* View */}
                                <a
                                  href={`/gallery/${g.slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 border border-white/10 rounded-lg text-stone-400 hover:text-white hover:border-white/20 transition-colors"
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
                                  className="p-1.5 border border-white/10 rounded-lg text-stone-400 hover:text-white hover:border-white/20 transition-colors"
                                  title="Drive folder"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                                  </svg>
                                </a>
                                {/* Edit */}
                                <button
                                  onClick={() => startEdit(g)}
                                  className="p-1.5 border border-white/10 rounded-lg text-stone-400 hover:text-white hover:border-white/20 transition-colors"
                                  title="Edit"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                                  </svg>
                                </button>
                                {/* Delete */}
                                {deleteConfirm === g.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-red-400">Sure?</span>
                                    <button
                                      onClick={() => deleteGallery(g.id)}
                                      disabled={deletingId === g.id}
                                      className="px-2 py-1 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg hover:bg-red-500/20 disabled:opacity-50"
                                    >
                                      {deletingId === g.id ? "..." : "Yes"}
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirm(null)}
                                      className="px-2 py-1 border border-white/10 text-stone-400 text-xs rounded-lg"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirm(g.id)}
                                    className="p-1.5 border border-white/10 rounded-lg text-stone-400 hover:text-red-400 hover:border-red-500/30 transition-colors"
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
