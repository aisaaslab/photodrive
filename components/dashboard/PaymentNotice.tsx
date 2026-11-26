"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { LOCALES, useLanguage } from "@/lib/i18n";
import { formatMoney } from "@/lib/shared/money";
import { dismissKey, pickBanner, type UserPayment } from "@/lib/payment-notice";

const read = (key: string) => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

/**
 * A banner on the dashboard when a refund or dispute reduced or paused the customer's access (S2-15), so the change is
 * never a surprise. Dismissible; reappears only for a different payment or status. Renders nothing when there is nothing to say.
 */
export function PaymentNotice() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [payments, setPayments] = useState<UserPayment[]>([]);
  const [dismissed, setDismissed] = useState(0); // bump to re-evaluate after a dismissal
  const [now] = useState(() => Date.now()); // fixed for this view

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    user
      .getIdToken()
      .then((token) => fetch("/api/user/payments", { headers: { Authorization: `Bearer ${token}` } }))
      .then(async (res) => (res.ok ? ((await res.json()).payments as UserPayment[]) : []))
      .then((list) => {
        if (!cancelled) setPayments(list ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  // `dismissed` is only a trigger: bumping it re-renders so the localStorage read below sees the new dismissal.
  const banner = pickBanner(payments, now, read);
  if (!banner) return null;

  const d = t.dashboard;
  const amount = banner.amountTotal !== null ? formatMoney(banner.amountTotal, banner.currency ?? "usd", LOCALES[lang]) : "";
  const message = (banner.status === "disputed" ? d.paymentBannerDisputed : banner.status === "dispute_lost" ? d.paymentBannerDisputeLost : d.paymentBannerRefunded).replace("{amount}", amount);

  return (
    <div role="status" data-dismissed={dismissed} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <p className="text-sm text-amber-100/90 leading-relaxed">{message}</p>
      <div className="flex items-center gap-3 shrink-0">
        <Link href="/dashboard/account" className="text-xs font-semibold text-white underline underline-offset-2 hover:text-amber-200">
          {d.paymentBannerDetails}
        </Link>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(dismissKey(banner), "1");
            } catch {}
            setDismissed((n) => n + 1);
          }}
          className="text-xs text-white/60 hover:text-white"
        >
          {d.paymentBannerDismiss}
        </button>
      </div>
    </div>
  );
}
