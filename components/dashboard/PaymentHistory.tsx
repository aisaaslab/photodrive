"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { LOCALES, useLanguage } from "@/lib/i18n";
import { formatMoney } from "@/lib/shared/money";

/** One payment as GET /api/user/payments returns it. */
export type Payment = {
  sessionId: string;
  amountTotal: number | null;
  currency: string | null;
  activatedAt: number | null;
  // What became of the payment (S2-15); paid unless refunded, disputed or lost in a dispute.
  status?: "fulfilled" | "refunded" | "partially_refunded" | "disputed" | "dispute_lost";
  refundedAmount?: number | null;
  // Stripe issued an invoice for it (S4-06); purchases from before invoices were switched on have none.
  hasInvoice?: boolean;
};

// In the app's language (English is US English), not the browser's own locale, so the page reads the same everywhere.
const formatDate = (ms: number, locale: string) => new Date(ms).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });

/**
 * The customer's payments with their status, a plain-language note for refunds and disputes, and a link to Stripe's hosted invoice
 * (shared by the Account page and the billing page, S9-02). `payments` is null while loading.
 */
export function PaymentHistory({ payments }: { payments: Payment[] | null }) {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const a = t.account;
  const locale = LOCALES[lang];
  const [invoiceBusy, setInvoiceBusy] = useState<string | null>(null);
  const [invoiceFailed, setInvoiceFailed] = useState<string | null>(null);

  // Opens Stripe's hosted invoice for one payment. The window is opened first (inside the click) so the browser does not block it.
  async function openInvoice(sessionId: string) {
    if (!user || invoiceBusy) return;
    setInvoiceBusy(sessionId);
    setInvoiceFailed(null);
    const win = window.open("", "_blank");
    if (win) win.opener = null;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/user/invoice?session=${encodeURIComponent(sessionId)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(String(res.status));
      const { url } = (await res.json()) as { url: string };
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch {
      win?.close();
      setInvoiceFailed(sessionId);
    } finally {
      setInvoiceBusy(null);
    }
  }

  if (payments === null) {
    return (
      <div className="space-y-2">
        <div className="h-5 w-56 bg-surface-2 rounded animate-pulse" />
        <div className="h-5 w-44 bg-surface-2 rounded animate-pulse" />
      </div>
    );
  }
  if (payments.length === 0) return <p className="text-sm text-fg-muted">{a.noPayments}</p>;

  return (
    <ul className="divide-y divide-line">
      {payments.map((p) => (
        <li key={p.sessionId} className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div>
            <p className="text-sm text-fg font-medium">{a.annualLicense}</p>
            <p className="text-xs text-fg-muted">{p.activatedAt !== null ? formatDate(p.activatedAt, locale) : ""}</p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="text-sm text-fg font-semibold">{p.amountTotal === null ? "—" : formatMoney(p.amountTotal, p.currency ?? "usd", locale)}</span>
            {p.hasInvoice && (
              <button
                type="button"
                onClick={() => openInvoice(p.sessionId)}
                disabled={invoiceBusy === p.sessionId}
                className="text-xs font-semibold text-accent hover:text-fg underline-offset-2 hover:underline disabled:opacity-50"
              >
                {a.invoice}
              </button>
            )}
            {!p.status || p.status === "fulfilled" ? (
              <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-success-bright text-xs font-semibold px-2 py-0.5 rounded-full border border-emerald-500/20">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {a.paymentPaid}
              </span>
            ) : (
              <span className="inline-flex items-center bg-amber-500/10 text-amber-300 text-xs font-semibold px-2 py-0.5 rounded-full border border-amber-500/20">
                {p.status === "refunded" ? a.paymentRefunded : p.status === "partially_refunded" ? a.paymentPartlyRefunded : p.status === "disputed" ? a.paymentDisputed : a.paymentDisputeLost}
              </span>
            )}
          </div>
          {invoiceFailed === p.sessionId && <p role="alert" className="basis-full text-xs text-amber-300">{a.invoiceUnavailable}</p>}
          {p.status && p.status !== "fulfilled" && (
            <p className="basis-full text-xs text-fg-muted leading-relaxed">
              {(p.status === "refunded" ? a.paymentRefundedNote
                : p.status === "partially_refunded" ? a.paymentPartlyRefundedNote
                  : p.status === "disputed" ? a.paymentDisputedNote
                    : a.paymentDisputeLostNote
              ).replace("{amount}", p.refundedAmount != null ? formatMoney(p.refundedAmount, p.currency ?? "usd", locale) : "")}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
