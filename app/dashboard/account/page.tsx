"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateProfile } from "firebase/auth";
import { useAuth, updateUserProfile } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import { AvatarEditor } from "@/components/dashboard/AvatarEditor";

type Payment = {
  sessionId: string;
  amountTotal: number | null;
  currency: string | null;
  activatedAt: number | null;
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatAmount(p: Payment): string {
  if (p.amountTotal === null) return "—";
  if (p.currency === "usd") return usd.format(p.amountTotal / 100);
  return `${(p.amountTotal / 100).toFixed(2)} ${(p.currency ?? "").toUpperCase()}`.trim();
}

export default function AccountPage() {
  const { user, loading, profile, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const a = t.account;

  const [status, setStatus] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    user
      .getIdToken()
      .then((token) =>
        Promise.all([
          fetch("/api/user/subscription", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/user/payments", { headers: { Authorization: `Bearer ${token}` } }),
        ])
      )
      .then(async ([subRes, payRes]) => {
        if (subRes.ok) {
          const data = await subRes.json();
          setStatus(data.status ?? "none");
          setExpiresAt(data.expiresAt ?? null);
          setPlanName(data.planName ?? null);
        }
        if (payRes.ok) {
          const data = await payRes.json();
          setPayments(data.payments ?? []);
        }
      })
      .catch(() => setPayments([]));
  }, [user]);

  useEffect(() => {
    setName(profile?.name || user?.displayName || "");
  }, [profile, user]);

  const isActive = status === "active" && (expiresAt ?? 0) > Date.now();
  const isAdminUser = status === "admin";
  const daysLeft =
    expiresAt !== null
      ? Math.max(0, Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;
  const storedName = profile?.name || user?.displayName || "";

  async function handleSaveName() {
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(a.nameRequired);
      return;
    }
    setSavingName(true);
    setNameError("");
    try {
      await updateUserProfile(user.uid, { name: trimmed });
      // Keep Firebase Auth's displayName in sync so surfaces that still read
      // it (admin fallbacks, the homepage avatar initial) show the new name.
      try {
        await updateProfile(user, { displayName: trimmed });
      } catch {}
      await refreshProfile();
      setName(trimmed);
    } catch {
      setNameError(a.error);
    } finally {
      setSavingName(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  const currentUser = user;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-up">
      <div>
        <Link href="/dashboard" className="text-xs text-white/50 hover:text-white transition-colors">
          {a.backToDashboard}
        </Link>
        <h1 className="text-2xl font-bold text-white mt-1" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {a.title}
        </h1>
      </div>

      <section className="bg-[#111111] border border-white/[0.1] rounded-2xl p-6">
        <h2 className="font-semibold text-white mb-4" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {a.membershipTitle}
        </h2>
        {status === null ? (
          <div className="h-6 w-40 bg-white/[0.06] rounded-lg animate-pulse" />
        ) : isAdminUser ? (
          <p className="text-sm text-white/70">{a.adminNote}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-emerald-500/20">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {a.statusActive}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-amber-500/20">
                  {a.statusNone}
                </span>
              )}
              {isActive && planName && (
                <span className="text-xs font-medium text-[#2dabe0]">{planName}</span>
              )}
              {isActive && expiresAt !== null && (
                <span className="text-xs text-white/60">
                  {expiresAt > 4102444800000
                    ? a.lifetime
                    : `${a.expiresOn} ${formatDate(expiresAt)}${
                        daysLeft !== null ? ` · ${daysLeft} ${a.daysRemaining}` : ""
                      }`}
                </span>
              )}
            </div>
            {!isActive && (
              <Link
                href="/subscribe"
                className="inline-flex items-center gap-2 bg-white text-stone-900 font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-stone-100 transition-all"
              >
                {a.subscribeCta}
              </Link>
            )}
          </div>
        )}
      </section>

      <section className="bg-[#111111] border border-white/[0.1] rounded-2xl p-6">
        <h2 className="font-semibold text-white mb-4" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {a.paymentsTitle}
        </h2>
        {payments === null ? (
          <div className="space-y-2">
            <div className="h-5 w-56 bg-white/[0.06] rounded animate-pulse" />
            <div className="h-5 w-44 bg-white/[0.06] rounded animate-pulse" />
          </div>
        ) : payments.length === 0 ? (
          <p className="text-sm text-white/50">{a.noPayments}</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {payments.map((p) => (
              <li key={p.sessionId} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-white font-medium">{a.annualLicense}</p>
                  <p className="text-xs text-white/50">
                    {p.activatedAt !== null ? formatDate(p.activatedAt) : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-sm text-white font-semibold">{formatAmount(p)}</span>
                  <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 text-xs font-semibold px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    {a.paymentPaid}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {renderProfileSection()}
    </div>
  );

  function renderProfileSection() {
    const avatarUrl = profile?.photoURL || currentUser.photoURL || null;
    return (
      <section className="bg-[#111111] border border-white/[0.1] rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold text-white" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {a.profileTitle}
        </h2>

        <div className="flex items-center gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={name}
              className="w-14 h-14 rounded-full object-cover ring-2 ring-white/10"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-xl font-bold text-white">
              {name?.[0]?.toUpperCase() || "?"}
            </div>
          )}
          <button
            onClick={() => setAvatarEditorOpen(true)}
            className="text-xs text-white/60 border border-white/10 rounded-lg px-3 py-2 hover:text-white hover:border-white/20 transition-colors"
          >
            {a.changeAvatar}
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-white mb-1.5">{a.nameLabel}</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              placeholder={a.namePlaceholder}
              className="flex-1 bg-[#080808] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-white/25 transition-all"
            />
            <button
              onClick={handleSaveName}
              disabled={savingName || name.trim() === storedName || !name.trim()}
              className="shrink-0 bg-white text-stone-900 font-bold px-5 rounded-xl text-sm hover:bg-stone-100 transition-all disabled:opacity-50 disabled:hover:bg-white flex items-center gap-1.5"
            >
              {savingName ? (
                <div className="w-4 h-4 border-2 border-stone-400 border-t-stone-900 rounded-full animate-spin" />
              ) : (
                a.save
              )}
            </button>
          </div>
          {nameError && <p className="text-xs text-red-400 mt-1.5">{nameError}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-white mb-1.5">{a.emailLabel}</label>
          <p className="text-sm text-white/70">{currentUser.email}</p>
        </div>

        {avatarEditorOpen && <AvatarEditor onClose={() => setAvatarEditorOpen(false)} />}
      </section>
    );
  }
}
