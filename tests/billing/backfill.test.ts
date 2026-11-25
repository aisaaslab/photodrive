import { describe, expect, it } from "vitest";
import { csvCell, replayPayments, toCsv } from "@/lib/server/billing/backfill";
import { DAY_MS, MONTH_MS, YEAR_MS } from "@/lib/server/billing/access";

const T0 = Date.UTC(2026, 0, 1);

describe("csv", () => {
  it("quotes commas, quotes and newlines, and leaves plain text alone", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(12.5)).toBe("12.5");
    expect(csvCell(false)).toBe("false");
  });

  it("defuses spreadsheet formulas in text cells (CSV injection)", () => {
    for (const evil of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)"]) {
      expect(csvCell(evil).replace(/^"/, "").startsWith("'")).toBe(true);
    }
    expect(csvCell(-5)).toBe("-5"); // a real negative number is not text
  });

  it("writes a header and one line per row, in the given column order", () => {
    expect(toCsv([{ a: 1, b: "x,y" }, { a: 2, b: "z" }], ["b", "a"])).toBe('b,a\n"x,y",1\nz,2\n');
    expect(toCsv([], ["a"])).toBe("a\n");
  });
});

describe("replayPayments", () => {
  const pay = (offsetDays: number, over: Record<string, unknown> = {}) => ({
    activatedAt: T0 + offsetDays * DAY_MS,
    interval: "monthly" as const,
    ...over,
  });

  it("stacks purchases made while active (the PAY-2 case)", () => {
    const r = replayPayments([pay(0), pay(10)]);
    expect(r.expiresAt).toBe(T0 + 10 * DAY_MS + 2 * MONTH_MS - 10 * DAY_MS); // t0 + 60 days
    expect(r.counted).toBe(2);
  });

  it("starts again from the payment date after a lapse", () => {
    expect(replayPayments([pay(0), pay(100)]).expiresAt).toBe(T0 + 100 * DAY_MS + MONTH_MS);
  });

  it("orders by activation time whatever order they are given in", () => {
    expect(replayPayments([pay(100), pay(0)]).expiresAt).toBe(T0 + 100 * DAY_MS + MONTH_MS);
  });

  it("uses the recorded grant, then free-code days, then the plan period", () => {
    expect(replayPayments([pay(0, { grantedMs: 5 * DAY_MS })]).expiresAt).toBe(T0 + 5 * DAY_MS);
    expect(replayPayments([pay(0, { accessDays: 7 })]).expiresAt).toBe(T0 + 7 * DAY_MS);
    expect(replayPayments([pay(0, { interval: "yearly" })]).expiresAt).toBe(T0 + YEAR_MS);
    expect(replayPayments([pay(0, { interval: null })]).expiresAt).toBe(T0 + YEAR_MS); // legacy default
  });

  it("does not count payments whose grant was taken back", () => {
    for (const status of ["refunded", "disputed", "dispute_lost"]) {
      expect(replayPayments([pay(0, { status })])).toEqual({ expiresAt: 0, counted: 0 });
    }
    expect(replayPayments([pay(0, { status: "partially_refunded" })]).counted).toBe(1);
    expect(replayPayments([pay(0, { status: "fulfilled" })]).counted).toBe(1);
  });

  it("has nothing to replay for no payments", () => {
    expect(replayPayments([])).toEqual({ expiresAt: 0, counted: 0 });
  });
});
