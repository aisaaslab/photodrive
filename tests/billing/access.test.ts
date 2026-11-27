import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  LIFETIME_FROM,
  MONTH_MS,
  YEAR_MS,
  computeExpiry,
  isLifetime,
  periodMs,
  revokeGrant,
} from "@/lib/shared/billing-access";

const now = Date.UTC(2026, 10, 25);
const LEGACY_LIFETIME = 32_503_680_000_000; // sentinel written by the admin "grant lifetime"

describe("constants", () => {
  it("monthly is 30 days and yearly is 365 days", () => {
    expect(MONTH_MS).toBe(30 * DAY_MS);
    expect(YEAR_MS).toBe(365 * DAY_MS);
    expect(periodMs("monthly")).toBe(MONTH_MS);
    expect(periodMs("yearly")).toBe(YEAR_MS);
    expect(periodMs(null)).toBe(YEAR_MS);
    expect(periodMs(undefined)).toBe(YEAR_MS);
  });

  it("recognises lifetime, including the existing year-3000 sentinel", () => {
    expect(isLifetime(LEGACY_LIFETIME)).toBe(true);
    expect(isLifetime(LIFETIME_FROM)).toBe(true);
    expect(isLifetime(LIFETIME_FROM - 1)).toBe(false);
    expect(isLifetime(null)).toBe(false);
    expect(isLifetime(undefined)).toBe(false);
  });
});

describe("computeExpiry", () => {
  it("new customer: starts from now", () => {
    for (const cur of [undefined, null, 0, NaN, -5]) {
      expect(computeExpiry({ now, currentExpiresAt: cur, grantedMs: YEAR_MS })).toBe(now + YEAR_MS);
    }
  });

  it("expired customer (PAY-1 renewal): starts from now, not the old expiry", () => {
    expect(computeExpiry({ now, currentExpiresAt: now - 10 * DAY_MS, grantedMs: MONTH_MS })).toBe(now + MONTH_MS);
  });

  it("active customer (PAY-2): stacks on top of the remaining time", () => {
    const cur = now + 10 * DAY_MS;
    expect(computeExpiry({ now, currentExpiresAt: cur, grantedMs: MONTH_MS })).toBe(cur + MONTH_MS);
  });

  it("expiring exactly now counts as expired", () => {
    expect(computeExpiry({ now, currentExpiresAt: now, grantedMs: DAY_MS })).toBe(now + DAY_MS);
  });

  it("monthly then yearly upgrade stacks both", () => {
    const afterMonthly = computeExpiry({ now, currentExpiresAt: 0, grantedMs: MONTH_MS });
    expect(computeExpiry({ now, currentExpiresAt: afterMonthly, grantedMs: YEAR_MS })).toBe(now + MONTH_MS + YEAR_MS);
  });

  it("lifetime accounts are never changed", () => {
    expect(computeExpiry({ now, currentExpiresAt: LEGACY_LIFETIME, grantedMs: YEAR_MS })).toBe(LEGACY_LIFETIME);
    expect(computeExpiry({ now, currentExpiresAt: LIFETIME_FROM, grantedMs: YEAR_MS })).toBe(LIFETIME_FROM);
  });

  it("zero, negative or invalid grants change nothing", () => {
    const cur = now + 5 * DAY_MS;
    for (const g of [0, -1, NaN, Infinity * 0]) {
      expect(computeExpiry({ now, currentExpiresAt: cur, grantedMs: g })).toBe(cur);
    }
    // ...and never turn an expired or empty account into one expiring "now"
    expect(computeExpiry({ now, currentExpiresAt: now - DAY_MS, grantedMs: 0 })).toBe(now - DAY_MS);
    expect(computeExpiry({ now, currentExpiresAt: undefined, grantedMs: 0 })).toBe(0);
  });

  it("is deterministic: the same inputs always give the same result", () => {
    const input = { now, currentExpiresAt: now + DAY_MS, grantedMs: MONTH_MS };
    expect(computeExpiry(input)).toBe(computeExpiry({ ...input }));
  });
});

describe("revokeGrant", () => {
  it("removes the granted time from an active account", () => {
    const cur = now + YEAR_MS + 3 * DAY_MS;
    expect(revokeGrant({ now, currentExpiresAt: cur, grantedMs: YEAR_MS })).toBe(now + 3 * DAY_MS);
  });

  it("never goes below now while the account is active", () => {
    const cur = now + 2 * DAY_MS;
    expect(revokeGrant({ now, currentExpiresAt: cur, grantedMs: YEAR_MS })).toBe(now);
  });

  it("does not revive an account that has already expired", () => {
    const cur = now - 3 * DAY_MS;
    expect(revokeGrant({ now, currentExpiresAt: cur, grantedMs: MONTH_MS })).toBe(cur);
    expect(revokeGrant({ now, currentExpiresAt: undefined, grantedMs: MONTH_MS })).toBe(0);
  });

  it("never touches lifetime accounts", () => {
    expect(revokeGrant({ now, currentExpiresAt: LEGACY_LIFETIME, grantedMs: YEAR_MS })).toBe(LEGACY_LIFETIME);
  });

  it("zero or invalid grants change nothing", () => {
    const cur = now + 5 * DAY_MS;
    expect(revokeGrant({ now, currentExpiresAt: cur, grantedMs: 0 })).toBe(cur);
    expect(revokeGrant({ now, currentExpiresAt: cur, grantedMs: NaN })).toBe(cur);
  });

  it("grant then revoke returns to the starting point", () => {
    const start = now + 4 * DAY_MS;
    const granted = computeExpiry({ now, currentExpiresAt: start, grantedMs: MONTH_MS });
    expect(revokeGrant({ now, currentExpiresAt: granted, grantedMs: MONTH_MS })).toBe(start);
  });
});
