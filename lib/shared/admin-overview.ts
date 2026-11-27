import { minorUnitDigits } from "@/lib/shared/money";

/** Small pure helpers of the admin Overview (S8-04). */

/** How old the stored numbers are, in words ("just now", "4 minutes ago", "2 hours ago"). */
export function ageLabel(computedAt: number | null | undefined, now: number): string {
  if (typeof computedAt !== "number" || !Number.isFinite(computedAt)) return "";
  const s = Math.max(0, Math.floor((now - computedAt) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} days ago`;
}

export type RevenueRow = { currency: string; minor: number };

/**
 * Revenue per currency, US dollars first and the rest alphabetically (currencies are never added together). Reads the exact minor-unit
 * figures; an overview stored before they existed has only major units, which are converted with each currency's own number of decimals.
 */
export function revenueRows(minor: Record<string, number> | undefined, major: Record<string, number> | undefined): RevenueRow[] {
  const rows: RevenueRow[] = minor && Object.keys(minor).length
    ? Object.entries(minor).map(([currency, m]) => ({ currency, minor: Math.round(m) }))
    : Object.entries(major ?? {}).map(([currency, v]) => ({ currency, minor: Math.round(v * 10 ** minorUnitDigits(currency)) }));
  return rows.filter((r) => r.minor > 0).sort((a, b) => (a.currency === "usd" ? -1 : b.currency === "usd" ? 1 : a.currency.localeCompare(b.currency)));
}
