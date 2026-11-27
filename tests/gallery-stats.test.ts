import { describe, expect, it } from "vitest";
import { dayKey, staleDays, summarize } from "@/lib/gallery/stats";

const NOW = Date.UTC(2026, 10, 27, 15, 0, 0); // 27 Nov 2026, afternoon UTC
const day = (offset: number) => dayKey(NOW - offset * 86_400_000);

describe("dayKey", () => {
  it("is the UTC day", () => {
    expect(dayKey(NOW)).toBe("2026-11-27");
    expect(dayKey(Date.UTC(2026, 0, 1, 23, 59, 59))).toBe("2026-01-01");
    expect(dayKey(Date.UTC(2026, 0, 2, 0, 0, 0))).toBe("2026-01-02");
  });
});

describe("staleDays", () => {
  it("keeps today and the 29 days before it, drops older buckets", () => {
    const days = { [day(0)]: {}, [day(29)]: {}, [day(30)]: {}, [day(90)]: {} };
    expect(staleDays(days, NOW).sort()).toEqual([day(90), day(30)].sort());
  });
  it("nothing to drop for no buckets", () => {
    expect(staleDays(undefined, NOW)).toEqual([]);
    expect(staleDays({}, NOW)).toEqual([]);
  });
});

describe("summarize", () => {
  it("totals, last visit and the last 30 days", () => {
    const s = summarize({
      views: 120, downloads: 40, favorites: 9, lastViewAt: NOW - 1000,
      days: { [day(0)]: { views: 5, downloads: 2 }, [day(10)]: { views: 7, favorites: 1 }, [day(45)]: { views: 100, downloads: 38, favorites: 8 } },
    }, NOW);
    expect(s).toEqual({ views: 120, downloads: 40, favorites: 9, lastViewAt: NOW - 1000, last30: { views: 12, downloads: 2, favorites: 1 } });
  });
  it("a gallery nobody opened is all zeros with no last visit", () => {
    expect(summarize(undefined, NOW)).toEqual({ views: 0, downloads: 0, favorites: 0, lastViewAt: null, last30: { views: 0, downloads: 0, favorites: 0 } });
  });
  it("ignores garbage values", () => {
    const s = summarize({ views: -3, downloads: Number.NaN, favorites: "x" as unknown as number, days: { [day(0)]: { views: -1 } } }, NOW);
    expect(s).toMatchObject({ views: 0, downloads: 0, favorites: 0, last30: { views: 0 } });
  });
});
