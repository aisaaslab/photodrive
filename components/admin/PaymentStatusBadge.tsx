import { STATUS_LABEL, type ShownStatus } from "@/lib/shared/admin-payments";

/**
 * A payment's status as a badge; "needs review" is added when an operator still has to look at it. A free-code checkout that was not
 * refunded says "Free code" instead of "Paid": no money was taken.
 */
export function StatusBadge({ status, needsReview, source }: { status: ShownStatus; needsReview?: boolean; source?: "paid" | "free_code" }) {
  const free = source === "free_code" && status === "fulfilled";
  const tone = free ? "bg-surface-2 text-fg-soft border-line" : status === "fulfilled" ? "bg-emerald-500/10 text-success-bright border-emerald-500/20" : status === "disputed" || status === "dispute_lost" ? "bg-red-500/10 text-danger border-red-500/20" : "bg-amber-500/10 text-amber-300 border-amber-500/20";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${tone}`}>{free ? "Free code" : STATUS_LABEL[status]}</span>
      {needsReview && <span className="text-[11px] font-semibold text-amber-300">Needs review</span>}
    </span>
  );
}
