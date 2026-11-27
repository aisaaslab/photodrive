import { describe, expect, it } from "vitest";
import { PLAN_CURRENCIES, STRIPE_MIN_MINOR, isPlanCurrency, toMajorString, toMinorUnits } from "@/lib/shared/plan-input";
import { PlanBody, PlanToggleBody } from "@/lib/shared/schemas/plans";

const minor = (v: unknown, c = "usd") => { const r = toMinorUnits(v, c); return r.ok ? r.minor : r.error; };

describe("toMinorUnits: a typed price becomes exactly what Stripe charges", () => {
  it("two-decimal currencies", () => {
    expect(minor("99")).toBe(9900);
    expect(minor("99.9")).toBe(9990);
    expect(minor("99.90")).toBe(9990);
    expect(minor("0.5")).toBe(50);
    expect(minor(99.99)).toBe(9999);
    expect(minor("1,50")).toBe(150); // a decimal comma
    expect(minor(" 12 ")).toBe(1200);
    expect(minor("12.340")).toBe(1234); // trailing zeros are not a third decimal
    expect(minor("19.99", "eur")).toBe(1999);
  });
  it("a zero-decimal currency is NOT multiplied by 100 (¥500 is 500, not 50,000)", () => {
    expect(minor("500", "jpy")).toBe(500);
    expect(minor("1200", "jpy")).toBe(1200);
    expect(minor("500.5", "jpy")).toMatch(/no decimals/);
    expect(minor("500.0", "jpy")).toBe(500);
  });
  it("refuses what the currency cannot express, zero, negatives and junk", () => {
    expect(minor("12.345")).toMatch(/at most 2 decimals/);
    for (const bad of ["0", "0.00", "-5", "", "abc", "1e3", "12.", ".5", "1 000", NaN, Infinity, null, undefined, {}]) expect(minor(bad), String(bad)).toMatch(/number|greater than zero/);
  });
  it("stops at Stripe's largest amount", () => {
    expect(minor("999999.99")).toBe(99_999_999);
    expect(minor("1000000")).toMatch(/too large/);
  });
});

describe("toMajorString: the inverse, for filling the editor", () => {
  it("round-trips every kind of price", () => {
    expect([[9900, "usd"], [9990, "usd"], [9999, "usd"], [50, "usd"], [500, "jpy"], [1999, "eur"], [100, "usd"]].map(([m, c]) => toMajorString(m as number, c as string)))
      .toEqual(["99", "99.9", "99.99", "0.5", "500", "19.99", "1"]);
    for (const [m, c] of [[1, "usd"], [12345, "gbp"], [99_999_999, "usd"], [750, "jpy"]] as const) {
      expect(minor(toMajorString(m, c), c)).toBe(m);
    }
  });
});

describe("currencies", () => {
  it("each has a name-able code and a Stripe minimum", () => {
    for (const c of PLAN_CURRENCIES) { expect(isPlanCurrency(c)).toBe(true); expect(STRIPE_MIN_MINOR[c]).toBeGreaterThan(0); }
    expect(isPlanCurrency("btc")).toBe(false);
    expect(isPlanCurrency("USD")).toBe(false); // stored lower case
  });
});

describe("PlanBody", () => {
  const ok = { name: "  Pro  ", description: "  For studios ", interval: "yearly", price: "99", features: [" A ", "", "B"], isPublic: true, active: true, highlight: false, sortOrder: 2 };
  it("trims, drops empty features, and converts the price", () => {
    const r = PlanBody.parse(ok);
    expect(r).toMatchObject({ name: "Pro", description: "For studios", interval: "yearly", priceCents: 9900, features: ["A", "B"], isPublic: true, sortOrder: 2 });
    expect("price" in r).toBe(false);
  });
  it("defaults what is left out, and leaves the currency for the route to decide", () => {
    const r = PlanBody.parse({ name: "X", interval: "monthly", price: 5 });
    expect(r).toMatchObject({ description: "", features: [], isPublic: false, active: true, highlight: false, sortOrder: 0, priceCents: 500 });
    expect(r.currency).toBeUndefined();
  });
  it("prices a yen plan in whole yen", () => {
    expect(PlanBody.parse({ ...ok, currency: "jpy", price: "4800" })).toMatchObject({ currency: "jpy", priceCents: 4800 });
    expect(PlanBody.safeParse({ ...ok, currency: "jpy", price: "48.5" }).success).toBe(false);
  });
  const problems = (v: unknown) => { const r = PlanBody.safeParse(v); return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`); };
  it("says which field is wrong", () => {
    expect(problems({ ...ok, name: "   " })).toEqual(["name: Plan name is required."]);
    expect(problems({ ...ok, price: "0" })).toEqual(["price: The price must be greater than zero."]);
    expect(problems({ ...ok, price: "12.345" })).toEqual(["price: USD allows at most 2 decimals."]);
    expect(problems({ ...ok, interval: "weekly" })).toEqual(["interval: Choose monthly or yearly."]);
    expect(problems({ ...ok, currency: "btc" })).toEqual(["currency: Choose one of the supported currencies."]);
    expect(problems({ ...ok, features: Array(13).fill("x") })).toEqual(["features: At most 12 features."]);
    expect(problems({ ...ok, sortOrder: 1.5 })).toEqual(["sortOrder: Sort order must be a whole number."]);
    expect(problems({ ...ok, name: "x".repeat(81) }).join()).toMatch(/^name/);
  });
  it("refuses the wrong types instead of storing them", () => {
    for (const bad of [{ ...ok, name: { $set: 1 } }, { ...ok, isPublic: "yes" }, { ...ok, features: "A\nB" }, null, "x", []]) expect(PlanBody.safeParse(bad).success).toBe(false);
  });
});

describe("PlanToggleBody", () => {
  it("accepts the switches, one or more", () => {
    expect(PlanToggleBody.safeParse({ isPublic: false }).success).toBe(true);
    expect(PlanToggleBody.safeParse({ active: true, highlight: true }).success).toBe(true);
  });
  it("refuses an empty body, other fields and non-booleans", () => {
    for (const bad of [{}, { name: "x" }, { isPublic: "true" }, { isPublic: true, price: 1 }]) expect(PlanToggleBody.safeParse(bad).success).toBe(false);
  });
});

import { planWarnings } from "@/lib/shared/plan-input";
describe("planWarnings", () => {
  const base: Parameters<typeof planWarnings>[0] = { name: "Pro", interval: "yearly", currency: "usd", priceMinor: 9900, isPublic: true, active: true };
  const other = (o: Partial<{ id: string; name: string; interval: string; currency: string; isPublic: boolean; active: boolean }> = {}) => ({ id: "o1", name: "Pro", interval: "monthly", currency: "usd", isPublic: true, active: true, ...o });
  const texts = (d = base, os: ReturnType<typeof other>[] = []) => planWarnings(d, os).map((w) => w.text);

  it("nothing to say about an ordinary public plan, even with its paired monthly plan", () => {
    expect(texts(base, [other()])).toEqual([]);
    expect(texts(base, [])).toEqual([]);
  });
  it("says when a plan will not be on the landing page", () => {
    expect(texts({ ...base, isPublic: false })[0]).toMatch(/Private: not shown on the landing page/);
    expect(texts({ ...base, active: false })[0]).toMatch(/Inactive: hidden from checkout/);
  });
  it("warns about a second public plan with the same name and period (they pair by name), but not about itself or a retired one", () => {
    expect(texts(base, [other({ interval: "yearly" })])[0]).toMatch(/already called “Pro” with yearly billing/);
    expect(texts({ ...base, id: "o1" }, [other({ interval: "yearly" })])).toEqual([]); // that plan is this one
    expect(texts(base, [other({ interval: "yearly", active: false })])).toEqual([]);
    expect(texts(base, [other({ interval: "yearly", isPublic: false })])).toEqual([]);
    expect(texts(base, [other({ name: " PRO ", interval: "yearly" })])).toHaveLength(1); // case and spaces do not matter
  });
  it("warns when the paired plan is in another currency, so no saving can be shown", () => {
    expect(texts(base, [other({ currency: "eur" })])[0]).toMatch(/monthly counterpart is priced in EUR/);
  });
  it("warns when the price is below what Stripe usually accepts, and says nothing while the price is not valid yet", () => {
    expect(texts({ ...base, priceMinor: 10 })[0]).toMatch(/below the smallest amount Stripe/);
    expect(texts({ ...base, priceMinor: 50 })).toEqual([]);
    expect(texts({ ...base, priceMinor: null })).toEqual([]);
    expect(texts({ ...base, currency: "jpy", priceMinor: 30 })[0]).toMatch(/below/);
  });
});
