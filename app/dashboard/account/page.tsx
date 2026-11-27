"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DeleteAccountButton } from "@/components/dashboard/DeleteAccountButton";
import { useRouter } from "next/navigation";
import { updateProfile } from "firebase/auth";
import { useAuth, updateUserProfile } from "@/components/auth/AuthProvider";
import { LOCALES, useLanguage } from "@/lib/i18n";
import { AvatarEditor } from "@/components/dashboard/AvatarEditor";
import { PaymentHistory, type Payment } from "@/components/dashboard/PaymentHistory";

// (amounts are formatted with formatMoney, in the viewer's language)

// In the app's language (English is US English), not the browser's own locale, so the page reads the same everywhere.
function formatDate(ms: number, locale: string): string {
  return new Date(ms).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AccountPage() {
  const { user, loading, profile, refreshProfile } = useAuth();
  const { t, lang } = useLanguage();
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
        <div className="w-5 h-5 border-2 border-line border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  const currentUser = user;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-up">
      <div>
        <Link href="/dashboard" className="text-xs text-fg-muted hover:text-fg transition-colors">
          {a.backToDashboard}
        </Link>
        <h1 className="text-2xl font-bold text-fg mt-1" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {a.title}
        </h1>
      </div>

      {renderProfileSection()}

      <section className="bg-surface border border-line rounded-card p-6">
        <h2 className="font-semibold text-fg mb-4" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {a.membershipTitle}
        </h2>
        {status === null ? (
          <div className="h-6 w-40 bg-surface-2 rounded-lg animate-pulse" />
        ) : isAdminUser ? (
          <p className="text-sm text-fg-soft">{a.adminNote}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-success-bright text-xs font-semibold px-2.5 py-1 rounded-full border border-emerald-500/20">
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
                <span className="text-xs font-medium text-accent">{planName}</span>
              )}
              {isActive && expiresAt !== null && (
                <span className="text-xs text-fg-muted">
                  {expiresAt > 4102444800000
                    ? a.lifetime
                    : `${a.expiresOn} ${formatDate(expiresAt, LOCALES[lang])}${
                        daysLeft !== null ? ` · ${daysLeft} ${a.daysRemaining}` : ""
                      }`}
                </span>
              )}
            </div>
            <Link href="/dashboard/billing" data-ui="account-billing-link" className="flex min-h-6 items-center text-xs font-semibold text-accent hover:text-fg underline-offset-2 hover:underline">
              {t.billing.linkFromAccount} →
            </Link>
            {!isActive && (
              <Link
                href="/subscribe"
                className="inline-flex items-center gap-2 bg-accent text-canvas font-bold px-5 py-2.5 rounded-pill text-sm hover:brightness-110 transition-all"
              >
                {a.subscribeCta}
              </Link>
            )}
          </div>
        )}
      </section>

      <section className="bg-surface border border-line rounded-card p-6">
        <h2 className="font-semibold text-fg mb-4" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {a.paymentsTitle}
        </h2>
        <PaymentHistory payments={payments} />
      </section>
      {/* Danger zone: deleting the account used to be a small link in every page's footer */}
      <section className="rounded-card border border-danger/30 bg-danger/5 p-6">
        <h2 className="font-semibold text-fg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{t.deleteAccount.title}</h2>
        <p className="mt-1.5 mb-4 max-w-xl text-sm text-fg-soft">{t.deleteAccount.body}</p>
        <DeleteAccountButton variant="danger" />
      </section>
    </div>
  );

  function renderProfileSection() {
    const avatarUrl = profile?.photoURL || currentUser.photoURL || null;
    return (
      <section className="bg-surface border border-line rounded-card p-6 space-y-4">
        <h2 className="font-semibold text-fg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {a.profileTitle}
        </h2>

        <div className="flex items-center gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={name}
              className="w-14 h-14 rounded-full object-cover ring-2 ring-line"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-surface-2 flex items-center justify-center text-xl font-bold text-fg">
              {name?.[0]?.toUpperCase() || "?"}
            </div>
          )}
          <button
            onClick={() => setAvatarEditorOpen(true)}
            className="text-xs text-fg-muted border border-line rounded-lg px-3 py-2 hover:text-fg hover:border-fg-muted/30 transition-colors"
          >
            {a.changeAvatar}
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-fg mb-1.5">{a.nameLabel}</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              placeholder={a.namePlaceholder}
              className="flex-1 bg-canvas border border-line rounded-xl px-4 py-2.5 text-sm text-fg placeholder:text-fg-muted outline-none focus:border-fg-muted/30 transition-all"
            />
            <button
              onClick={handleSaveName}
              disabled={savingName || name.trim() === storedName || !name.trim()}
              className="shrink-0 bg-accent text-canvas font-bold px-5 rounded-pill text-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:hover:bg-white flex items-center gap-1.5"
            >
              {savingName ? (
                <div className="w-4 h-4 border-2 border-canvas/30 border-t-canvas rounded-full animate-spin" />
              ) : (
                a.save
              )}
            </button>
          </div>
          {nameError && <p className="text-xs text-danger mt-1.5">{nameError}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-fg mb-1.5">{a.emailLabel}</label>
          <p className="text-sm text-fg-soft">{currentUser.email}</p>
        </div>

        {avatarEditorOpen && <AvatarEditor onClose={() => setAvatarEditorOpen(false)} />}
      </section>
    );
  }
}
