import { describe, expect, it } from "vitest";
import { ageLabel, revenueRows } from "@/lib/shared/admin-overview";

const NOW = Date.UTC(2026, 10, 27, 12);
describe("ageLabel", () => {
  it("says how old the numbers are", () => {
    expect(ageLabel(NOW, NOW)).toBe("just now");
    expect(ageLabel(NOW - 44_000, NOW)).toBe("just now");
    expect(ageLabel(NOW - 60_000, NOW)).toBe("1 minute ago");
    expect(ageLabel(NOW - 4 * 60_000, NOW)).toBe("4 minutes ago");
    expect(ageLabel(NOW - 90 * 60_000, NOW)).toBe("2 hours ago");
    expect(ageLabel(NOW - 60 * 3_600_000, NOW)).toBe("3 days ago");
  });
  it("is empty for a missing time, and never negative for one in the future", () => {
    expect(ageLabel(undefined, NOW)).toBe("");
    expect(ageLabel(NaN, NOW)).toBe("");
    expect(ageLabel(NOW + 5000, NOW)).toBe("just now");
  });
});

describe("revenueRows", () => {
  it("uses the exact minor-unit figures, dollars first, others alphabetical, never combined", () => {
    expect(revenueRows({ eur: 8900, usd: 19800, jpy: 4800, gbp: 0 }, undefined)).toEqual([
      { currency: "usd", minor: 19800 }, { currency: "eur", minor: 8900 }, { currency: "jpy", minor: 4800 },
    ]);
  });
  it("converts an older stored overview (major units only) by each currency's own decimals: ¥48 is 48, $198 is 19800", () => {
    expect(revenueRows(undefined, { usd: 198, jpy: 4800, eur: 89.5 })).toEqual([
      { currency: "usd", minor: 19800 }, { currency: "eur", minor: 8950 }, { currency: "jpy", minor: 4800 },
    ]);
    expect(revenueRows({}, { usd: 12 })).toEqual([{ currency: "usd", minor: 1200 }]);
  });
  it("is empty when nothing was taken", () => {
    expect(revenueRows(undefined, undefined)).toEqual([]);
    expect(revenueRows({}, {})).toEqual([]);
  });
});
