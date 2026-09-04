"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

type Stats = {
  totalUsers: number;
  newUsers7d: number;
  newUsers30d: number;
  activeSubscriptions: number;
  monthlySubscriptions: number;
  yearlySubscriptions: number;
  compSubscriptions: number;
  totalGalleries: number;
  newGalleries30d: number;
  revenueUsd: number;
  paymentCount: number;
  expiringSoonCount: number;
  planCount: number;
  publicPlanCount: number;
};

type ExpiringUser = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  expiresAt: number | null;
  daysLeft: number;
  planName: string | null;
};

type RecentUser = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  createdAt: string;
  subscriptionActive: boolean;
};

function formatDate(ts: number | string | null | undefined) {
  if (!ts) return "—";
  const d = new Date(typeof ts === "number" ? ts : ts);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMoney(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function Avatar({ src, name }: { src?: string | null; name: string }) {
  const initials = name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className="w-6 h-6 rounded-full ring-1 ring-white/10 object-cover" />;
  }
  return (
    <div className="w-6 h-6 rounded-full bg-[#17509e]/20 flex items-center justify-center text-[10px] font-bold text-[#2dabe0] ring-1 ring-[#17509e]/20">
      {initials}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  tone?: "ok" | "warn" | "info";
}) {
  const toneClasses =
    tone === "ok"
      ? "bg-emerald-500/[0.06] border-emerald-500/20"
      : tone === "warn"
        ? "bg-amber-500/[0.06] border-amber-500/20"
        : tone === "info"
          ? "bg-[#17509e]/[0.08] border-[#17509e]/25"
          : "bg-white/[0.03] border-white/[0.06]";
  const iconClasses =
    tone === "ok" ? "text-emerald-400 bg-emerald-500/10" : tone === "warn" ? "text-amber-400 bg-amber-500/10" : tone === "info" ? "text-[#2dabe0] bg-[#17509e]/10" : "text-stone-400 bg-white/[0.06]";
  return (
    <div className={`border rounded-2xl p-5 ${toneClasses}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
            {value}
          </div>
          <div className="text-xs text-stone-400 mt-1">{label}</div>
        </div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconClasses}`}>
          <svg width={18} height={18} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
      </div>
      {sub && <div className="text-[11px] text-stone-500 mt-2">{sub}</div>}
    </div>
  );
}

export default function AdminOverviewPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [expiringSoon, setExpiringSoon] = useState<ExpiringUser[]>([]);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    user.getIdToken().then((token) =>
      fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } })
    ).then(async (res) => {
      if (!res.ok || cancelled) return;
      const data = await res.json();
      setStats(data.stats);
      setExpiringSoon(data.expiringSoon ?? []);
      setRecentUsers(data.recentUsers ?? []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  if (!stats) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          Overview
        </h1>
        <p className="text-sm text-stone-400 mt-1">Your store at a glance.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <StatCard
          label="Total users"
          value={stats.totalUsers}
          sub={`+${stats.newUsers7d} this week · +${stats.newUsers30d} this month`}
          icon="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
        />
        <StatCard
          label="Active subscriptions"
          value={stats.activeSubscriptions}
          tone="ok"
          sub={`${stats.monthlySubscriptions} monthly · ${stats.yearlySubscriptions} yearly · ${stats.compSubscriptions} comp`}
          icon="M4.5 12.75l6 6 9-13.5"
        />
        <StatCard
          label="Galleries"
          value={stats.totalGalleries}
          sub={`+${stats.newGalleries30d} in last 30 days`}
          icon="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
        />
        <StatCard
          label="Revenue (all time)"
          value={formatMoney(stats.revenueUsd)}
          tone="ok"
          sub={`${stats.paymentCount} payment${stats.paymentCount === 1 ? "" : "s"} recorded`}
          icon="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <StatCard
          label="Expiring < 30 days"
          value={stats.expiringSoonCount}
          tone={stats.expiringSoonCount > 0 ? "warn" : undefined}
          sub={stats.expiringSoonCount > 0 ? "Needs a renewal nudge" : "Nothing expiring soon"}
          icon="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <StatCard
          label="Payment plans"
          value={stats.planCount}
          tone="info"
          sub={`${stats.publicPlanCount} public · ${stats.planCount - stats.publicPlanCount} private/inactive`}
          icon="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Expiring soon */}
        <div className="border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
              Expiring soon
            </h2>
            <span className="text-xs text-stone-500">≤ 30 days</span>
          </div>
          {expiringSoon.length === 0 ? (
            <p className="text-sm text-stone-500 py-6 text-center">No subscriptions expiring soon.</p>
          ) : (
            <div className="space-y-2">
              {expiringSoon.map((u) => (
                <div key={u.uid} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 flex items-center gap-2">
                    <Avatar src={u.photoURL} name={u.displayName || u.email} />
                    <span className="text-white truncate">{u.displayName || u.email}</span>
                    <span className="text-stone-500 truncate hidden sm:inline">· {u.email}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {u.planName && <span className="text-xs text-stone-500 hidden sm:inline">{u.planName}</span>}
                    <span className={`font-semibold tabular-nums ${u.daysLeft <= 7 ? "text-red-400" : "text-amber-400"}`}>
                      {u.daysLeft === 0 ? "expires today" : `in ${u.daysLeft}d`}
                    </span>
                    <a href={`mailto:${u.email}`} className="text-xs px-2.5 py-1 rounded-lg border border-white/10 text-stone-300 hover:text-white hover:border-white/20 transition-colors">
                      Email
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent sign-ups */}
        <div className="border border-white/[0.06] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
            Recent sign-ups
          </h2>
          {recentUsers.length === 0 ? (
            <p className="text-sm text-stone-500 py-6 text-center">No users yet.</p>
          ) : (
            <div className="space-y-2">
              {recentUsers.map((u) => (
                <div key={u.uid} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 flex items-center gap-2">
                    <Avatar src={u.photoURL} name={u.displayName || u.email} />
                    <span className="text-white truncate">{u.displayName || "—"}</span>
                    <span className="text-stone-500 truncate hidden sm:inline">· {u.email}</span>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    {u.subscriptionActive ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/[0.04] text-stone-500 border border-white/[0.06]">Free</span>
                    )}
                    <span className="text-xs text-stone-500 tabular-nums">{formatDate(u.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link href="/dashboard/admin/users" className="inline-block text-xs text-[#2dabe0] hover:underline mt-4">
            Manage users →
          </Link>
        </div>
      </div>
    </div>
  );
}
