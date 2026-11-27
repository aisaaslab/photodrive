"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { LOCALES, useLanguage } from "@/lib/i18n";
import { billingSummary, type BillingState } from "@/lib/shared/billing-state";
import { PaymentHistory, type Payment } from "@/components/dashboard/PaymentHistory";

type Sub = {
  status: string;
  expiresAt: number | null;
  planName: string | null;
  interval: string | null;
  comped: boolean;
  canRenewEarly: boolean;
  reminders: boolean;
  lapse: { enforced: boolean; graceDays: number };
};

const BADGE: Record<BillingState, string> = {
  active: "bg-emerald-500/10 text-success-bright border-emerald-500/20",
  lifetime: "bg-emerald-500/10 text-success-bright border-emerald-500/20",
  comped: "bg-emerald-500/10 text-success-bright border-emerald-500/20",
  admin: "bg-surface-2 text-fg-soft border-line",
  expiring: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  grace: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  lapsed: "bg-red-500/10 text-red-300 border-red-500/20",
  none: "bg-surface-2 text-fg-soft border-line",
};

const btn = "inline-flex items-center gap-2 bg-accent text-canvas font-bold px-5 py-2.5 rounded-pill text-sm hover:brightness-110 transition-all";

/**
 * Billing (S9-02): where the customer's plan stands, what to do about it, what happens to their galleries when it ends (decision D3,
 * worded from what the server really does), and the payment history with invoice links. The state comes from one pure rule,
 * lib/shared/billing-state.ts, so this page and the dashboard banner cannot disagree.
 */
export default function BillingPage() {
  const { user, loading } = useAuth();
  const { t, lang } = useLanguage();
  const router = useRouter();
  const b = t.billing;
  const locale = LOCALES[lang];

  const [sub, setSub] = useState<Sub | null>(null);
  // The moment the plan was read, so the page does not read the clock while rendering.
  const [readAt, setReadAt] = useState(0);
  const [payments, setPayments] = useState<Payment[] | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    user.getIdToken()
      .then((token) => Promise.all([
        fetch("/api/user/subscription", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/user/payments", { headers: { Authorization: `Bearer ${token}` } }),
      ]))
      .then(async ([subRes, payRes]) => {
        if (subRes.ok) {
          const d = await subRes.json();
          setReadAt(Date.now());
          setSub({
            status: d.status ?? "none",
            expiresAt: typeof d.expiresAt === "number" && d.expiresAt > 0 ? d.expiresAt : null,
            planName: typeof d.planName === "string" ? d.planName : null,
            interval: typeof d.planInterval === "string" ? d.planInterval : null,
            comped: d.comped === true,
            canRenewEarly: d.canRenewEarly === true,
            reminders: d.reminders === true,
            lapse: { enforced: d.lapse?.enforced === true, graceDays: typeof d.lapse?.graceDays === "number" ? d.lapse.graceDays : 14 },
          });
        }
        setPayments(payRes.ok ? ((await payRes.json()).payments ?? []) : []);
      })
      .catch(() => setPayments([]));
  }, [user]);

  if (loading || !user) {
    return <div className="flex items-center justify-center py-24"><div className="w-5 h-5 border-2 border-line border-t-white/60 rounded-full animate-spin" /></div>;
  }

  const date = (ms: number) => new Date(ms).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
  const s = sub && billingSummary({ admin: sub.status === "admin", expiresAt: sub.expiresAt, comped: sub.comped, interval: sub.interval, lapseEnforced: sub.lapse.enforced, now: readAt });

  const statusText: Record<BillingState, string> = {
    active: b.statusActive, expiring: b.statusExpiring, grace: b.statusGrace, lapsed: b.statusLapsed,
    lifetime: b.statusLifetime, comped: b.statusComped, none: b.statusNone, admin: b.statusAdmin,
  };
  const message = !s || !sub ? "" : ({
    active: b.msgActive,
    expiring: b.msgExpiring,
    grace: b.msgGrace.replace("{date}", s.graceEndsAt ? date(s.graceEndsAt) : ""),
    lapsed: s.galleriesOffline ? b.msgLapsedOffline : b.msgLapsedKept,
    lifetime: b.msgLifetime,
    comped: b.msgComped.replace("{date}", sub.expiresAt ? date(sub.expiresAt) : ""),
    none: b.msgNone,
    admin: b.msgAdmin,
  } satisfies Record<BillingState, string>)[s.state];

  const ended = s?.state === "grace" || s?.state === "lapsed";
  const running = s?.state === "active" || s?.state === "expiring" || s?.state === "comped";
  const showDates = !!s && !!sub?.expiresAt && !["none", "admin", "lifetime"].includes(s.state);
  const showLapseBlock = !!s && s.state !== "admin" && s.state !== "lifetime";

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-up">
      <div>
        <Link href="/dashboard/account" className="inline-flex min-h-6 items-center text-xs text-fg-muted hover:text-fg transition-colors">{b.back}</Link>
        <h1 className="text-2xl font-bold text-fg mt-1" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{b.title}</h1>
        <p className="text-sm text-fg-muted mt-1">{b.subtitle}</p>
      </div>

      <section data-ui="billing-plan" className="bg-surface border border-line rounded-card p-6">
        <h2 className="font-semibold text-fg mb-4" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{b.planTitle}</h2>
        {!s || !sub ? (
          <div className="space-y-2"><div className="h-6 w-40 bg-surface-2 rounded-lg animate-pulse" /><div className="h-5 w-64 bg-surface-2 rounded animate-pulse" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span data-ui="billing-status" data-state={s.state} className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${BADGE[s.state]}`}>
                {statusText[s.state]}
              </span>
            </div>

            {(showDates || s.state === "lifetime") && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-fg-muted">{b.planLabel}</dt>
                <dd className="text-fg font-medium">{sub.planName ?? "—"}</dd>
                {showDates && sub.expiresAt && (
                  <>
                    <dt className="text-fg-muted">{ended ? b.endedLabel : b.endsLabel}</dt>
                    <dd className="text-fg font-medium">{date(sub.expiresAt)}</dd>
                  </>
                )}
                {running && s.daysLeft !== null && (
                  <>
                    <dt className="text-fg-muted">{b.daysLeftLabel}</dt>
                    <dd className="text-fg font-medium tabular-nums">{s.daysLeft}</dd>
                  </>
                )}
                {s.state === "lifetime" && (
                  <>
                    <dt className="text-fg-muted">{b.statusLabel}</dt>
                    <dd className="text-fg font-medium">{b.lifetimeValue}</dd>
                  </>
                )}
              </dl>
            )}

            <p data-ui="billing-message" className="text-sm text-fg-soft leading-relaxed">{message}</p>

            {(s.state === "none" || ended) && (
              <Link href="/subscribe" data-ui="billing-renew" className={btn}>{s.state === "none" ? b.subscribe : b.renew}</Link>
            )}
            {running && sub.canRenewEarly && (
              <div className="space-y-1.5">
                <Link href="/subscribe" data-ui="billing-renew" className={btn}>{b.renewEarly}</Link>
                <p className="text-xs text-fg-muted">{b.renewEarlyHint}</p>
              </div>
            )}
            {running && !sub.canRenewEarly && <p className="text-xs text-fg-muted">{b.renewLaterHint}</p>}
          </div>
        )}
      </section>

      {showLapseBlock && sub && (
        <section data-ui="billing-lapse" className="bg-surface border border-line rounded-card p-6">
          <h2 className="font-semibold text-fg mb-3" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{b.lapseTitle}</h2>
          <ul className="space-y-2 text-sm text-fg-soft leading-relaxed list-disc pl-5">
            {sub.lapse.enforced ? (
              <>
                <li>{b.lapseGrace.replace("{days}", String(sub.lapse.graceDays))}</li>
                <li>{b.lapseOffline}</li>
                <li>{b.lapseSafe}</li>
              </>
            ) : (
              <>
                <li>{b.lapseKept1}</li>
                <li>{b.lapseKept2}</li>
              </>
            )}
            {sub.reminders && (s?.state === "active" || s?.state === "expiring") && <li>{b.remindersLine}</li>}
          </ul>
        </section>
      )}

      <section className="bg-surface border border-line rounded-card p-6">
        <h2 className="font-semibold text-fg mb-4" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{b.paymentsTitle}</h2>
        <PaymentHistory payments={payments} />
      </section>
    </div>
  );
}
