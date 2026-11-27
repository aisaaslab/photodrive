/**
 * Pure rules of the free-code access rules (S8-03), shared by the admin API and the screen. A rule fixes how long a 100%-off Stripe code
 * grants access; see lib/promo-codes.ts for how a $0 checkout resolves it.
 */
export const MIN_ACCESS_DAYS = 1;
export const MAX_ACCESS_DAYS = 3650; // 10 years
export const CODE_RE = /^[A-Z0-9_-]{2,40}$/;

export function normalizeCode(code: unknown): string {
  return typeof code === "string" ? code.trim().toUpperCase().replace(/\s+/g, "") : "";
}

/** A whole number of days within bounds, or null. */
export function validAccessDays(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const d = Math.trunc(n);
  return d >= MIN_ACCESS_DAYS && d <= MAX_ACCESS_DAYS ? d : null;
}

/** 365 → "1 year", 90 → "3 months", 45 → "45 days". */
export function humanDays(days: number): string {
  if (days % 365 === 0) return `${days / 365} year${days === 365 ? "" : "s"}`;
  if (days % 30 === 0) return `${days / 30} month${days === 30 ? "" : "s"}`;
  return `${days} day${days === 1 ? "" : "s"}`;
}
