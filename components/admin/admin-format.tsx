import { formatMoney } from "@/lib/shared/money";
import type { PaymentFlag } from "@/lib/access-source";

/** Small shared pieces of the admin Users screens (S7-05). */
export const LIFETIME_FROM = 4102444800000; // anything beyond 2100 is "lifetime"

export function formatDate(ts: number | string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}
export const formatPaid = (cents: number | null, currency: string | null) => (cents === null ? "—" : formatMoney(cents, currency ?? "usd", "en-US"));

export const SOURCE_LABEL = { admin: "Admin grant", free_code: "Free code", paid: "Paid" } as const;

export const flagLabel = (f: Pick<PaymentFlag, "status" | "needsReview">) =>
  f.status === "refunded" ? "Refunded" : f.status === "partially_refunded" ? "Partially refunded" : f.status === "disputed" ? "Disputed" : f.status === "dispute_lost" ? "Dispute lost" : "Needs review";
export const flagStyle = (f: Pick<PaymentFlag, "status">) =>
  f.status === "dispute_lost" || f.status === "disputed" ? "bg-red-500/10 text-danger border-red-500/20" : "bg-amber-500/10 text-amber-300 border-amber-500/20";

export function Avatar({ src, name, size = 36 }: { src?: string | null; name: string; size?: number }) {
  const initials = name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  const style = { width: size, height: size };
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" style={style} className="rounded-full ring-1 ring-line object-cover shrink-0" />;
  return <div aria-hidden style={style} className="rounded-full bg-accent-deep/20 flex items-center justify-center text-xs font-bold text-accent ring-1 ring-accent-deep/20 shrink-0">{initials}</div>;
}

/** The one-word state of an account, with the date that explains it. */
export function accessState(u: { subscriptionActive: boolean; subscriptionExpiresAt: number | null; compGranted: boolean }, now = Date.now()) {
  const end = u.subscriptionExpiresAt ?? 0;
  if (u.subscriptionActive) {
    if (end > LIFETIME_FROM) return { label: "Lifetime", tone: "ok" as const, detail: "no end date" };
    const days = Math.ceil((end - now) / 86400000);
    return { label: days <= 30 ? "Expiring soon" : "Active", tone: days <= 30 ? ("warn" as const) : ("ok" as const), detail: `ends ${formatDate(end)}` };
  }
  if (end > 0) return { label: "Lapsed", tone: "muted" as const, detail: `ended ${formatDate(end)}` };
  return { label: "No plan", tone: "muted" as const, detail: "" };
}

export function StateBadge({ state }: { state: ReturnType<typeof accessState> }) {
  const tone = state.tone === "ok" ? "bg-emerald-500/10 text-success-bright border-emerald-500/20" : state.tone === "warn" ? "bg-amber-500/10 text-amber-300 border-amber-500/25" : "bg-surface-2 text-fg-muted border-line";
  return <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${tone}`}>{state.label}</span>;
}
