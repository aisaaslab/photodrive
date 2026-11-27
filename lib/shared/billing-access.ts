/**
 * Pure access-time rules (S1-02). No I/O, no clock: callers pass `now`.
 * Used by customer fulfilment, admin plan/grant actions and refunds so every
 * path gives identical results for identical inputs.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MONTH_MS = 30 * DAY_MS;
export const YEAR_MS = 365 * DAY_MS;

/**
 * Any expiry at or after 2100-01-01 is "lifetime". The sentinel written by the
 * admin "grant lifetime" action is year 3000 (32503680000000), which is above
 * this threshold.
 */
export const LIFETIME_FROM = 4_102_444_800_000;

/** Value the admin "grant lifetime" action writes (Jan 1, 3000). */
export const LIFETIME_SENTINEL = 32_503_680_000_000;

export function isLifetime(expiresAt: number | null | undefined): boolean {
  return typeof expiresAt === "number" && expiresAt >= LIFETIME_FROM;
}

export function periodMs(interval: "monthly" | "yearly" | null | undefined): number {
  return interval === "monthly" ? MONTH_MS : YEAR_MS;
}

type Input = {
  now: number;
  /** Current `subscriptionExpiresAt`; missing, 0 or invalid means "never subscribed". */
  currentExpiresAt?: number | null;
  /** Access time to add (or take away), in milliseconds. */
  grantedMs: number;
};

function current(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

function grant(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * New expiry after adding `grantedMs`, stacking from the later of `now` and the
 * current expiry. Lifetime accounts are never shortened or changed. A zero or
 * invalid grant changes nothing (so it can never turn an expired account into
 * one that expires "now").
 */
export function computeExpiry({ now, currentExpiresAt, grantedMs }: Input): number {
  const cur = current(currentExpiresAt);
  if (isLifetime(cur)) return cur;
  const g = grant(grantedMs);
  if (g === 0) return cur;
  return Math.max(now, cur) + g;
}

/**
 * Expiry after taking back a previously granted `grantedMs` (refund, lost
 * dispute). Never goes below `now` for an account that is still active, never
 * extends an account that has already expired, and never touches lifetime.
 */
export function revokeGrant({ now, currentExpiresAt, grantedMs }: Input): number {
  const cur = current(currentExpiresAt);
  if (isLifetime(cur)) return cur;
  const g = grant(grantedMs);
  if (g === 0 || cur <= now) return cur;
  return Math.max(now, cur - g);
}
