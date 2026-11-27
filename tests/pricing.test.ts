import { describe, expect, it } from "vitest";
import { buildTiers, discountPct, pricingView, tierDiscount, visibleTiers, type PublicPlan } from "@/lib/shared/pricing";

const plan = (over: Partial<PublicPlan>): PublicPlan => ({
  id: "p", name: "Pro", description: "", interval: "monthly", priceCents: 1200, currency: "usd", features: [], highlight: false, sortOrder: 0, ...over,
});
const M = plan({ id: "m", interval: "monthly", priceCents: 1200 });
const Y = plan({ id: "y", interval: "yearly", priceCents: 9900 });

describe("discountPct", () => {
  it("the design's example: $12 a month against $99 a year is 31%", () => expect(discountPct(1200, 9900)).toBe(31));
  it("is 0 when the yearly price is not cheaper per month, or a price is missing", () => {
    expect(discountPct(1200, 14400)).toBe(0);
    expect(discountPct(1200, 20000)).toBe(0);
    expect(discountPct(0, 9900)).toBe(0);
    expect(discountPct(1200, 0)).toBe(0);
  });
});

describe("buildTiers", () => {
  it("pairs monthly and yearly variants by name, ignoring case and spaces", () => {
    const tiers = buildTiers([M, plan({ id: "y", name: " pro ", interval: "yearly", priceCents: 9900 })]);
    expect(tiers).toHaveLength(1);
    expect(tiers[0].monthly?.id).toBe("m");
    expect(tiers[0].yearly?.id).toBe("y");
  });
  it("orders by sort order, then name", () => {
    const tiers = buildTiers([plan({ id: "b", name: "Studio", sortOrder: 2 }), plan({ id: "a", name: "Solo", sortOrder: 1 }), plan({ id: "c", name: "Agency", sortOrder: 1 })]);
    expect(tiers.map((t) => t.name)).toEqual(["Agency", "Solo", "Studio"]);
  });
  it("takes the lowest sort order of a pair", () => {
    expect(buildTiers([plan({ id: "a", sortOrder: 5 }), plan({ id: "b", interval: "yearly", sortOrder: 2 })])[0].sortOrder).toBe(2);
  });
});

describe("differently named monthly and yearly plans", () => {
  const monthly = plan({ id: "m", name: "Monthly", interval: "monthly", priceCents: 1200 });
  const yearly = plan({ id: "y", name: "Yearly", interval: "yearly", priceCents: 9900 });
  it("a lone monthly and a lone yearly plan pair, so the yearly one shows its saving", () => {
    const v = pricingView([monthly, yearly]);
    expect(v.tiers).toHaveLength(1);
    expect(v.showToggle).toBe(true);
    expect(v.maxDiscount).toBe(31);
    expect(visibleTiers(v, "yearly")[0].plan.name).toBe("Yearly");
    expect(visibleTiers(v, "monthly")[0].plan.name).toBe("Monthly");
  });
  it("with more plans than that, only same-named plans pair", () => {
    expect(buildTiers([monthly, yearly, plan({ id: "x", name: "Studio", interval: "monthly" })])).toHaveLength(3);
  });
  it("only monthly plans: no toggle and no saving; only yearly: shown as yearly, no saving", () => {
    expect(pricingView([monthly])).toMatchObject({ showToggle: false, defaultMode: "monthly", maxDiscount: 0 });
    expect(pricingView([yearly])).toMatchObject({ showToggle: false, defaultMode: "yearly", maxDiscount: 0 });
  });
});

describe("tierDiscount", () => {
  it("needs both variants and one currency", () => {
    expect(tierDiscount(buildTiers([M, Y])[0])).toBe(31);
    expect(tierDiscount(buildTiers([M])[0])).toBe(0);
    expect(tierDiscount(buildTiers([M, plan({ id: "y", interval: "yearly", priceCents: 9900, currency: "eur" })])[0])).toBe(0);
  });
});

describe("pricingView and visibleTiers", () => {
  it("monthly and yearly plans: toggle shown, yearly first, discount known", () => {
    const v = pricingView([M, Y]);
    expect(v.showToggle).toBe(true);
    expect(v.defaultMode).toBe("yearly");
    expect(v.maxDiscount).toBe(31);
    expect(v.discountsDiffer).toBe(false);
    expect(visibleTiers(v, "monthly").map((x) => x.plan.id)).toEqual(["m"]);
    expect(visibleTiers(v, "yearly").map((x) => x.plan.id)).toEqual(["y"]);
  });
  it("only yearly plans: no toggle, shows them whatever the mode asked for", () => {
    const v = pricingView([Y]);
    expect(v.showToggle).toBe(false);
    expect(visibleTiers(v, "monthly").map((x) => x.plan.id)).toEqual(["y"]);
  });
  it("only monthly plans: no toggle, monthly is the default", () => {
    const v = pricingView([M]);
    expect(v.showToggle).toBe(false);
    expect(v.defaultMode).toBe("monthly");
    expect(visibleTiers(v, "yearly").map((x) => x.plan.id)).toEqual(["m"]);
  });
  it("tiers missing a variant are left out of that mode", () => {
    const v = pricingView([M, Y, plan({ id: "s", name: "Solo", interval: "monthly" })]);
    expect(visibleTiers(v, "yearly").map((x) => x.plan.id)).toEqual(["y"]);
    expect(visibleTiers(v, "monthly").map((x) => x.plan.id).sort()).toEqual(["m", "s"]);
  });
  it("differing savings are flagged so the badge can say 'up to'", () => {
    const v = pricingView([M, Y, plan({ id: "m2", name: "Studio", interval: "monthly", priceCents: 2000 }), plan({ id: "y2", name: "Studio", interval: "yearly", priceCents: 20000 })]);
    expect(v.discountsDiffer).toBe(true);
    expect(v.maxDiscount).toBe(31);
  });
  it("no plans: nothing to show", () => {
    const v = pricingView([]);
    expect(v.tiers).toEqual([]);
    expect(v.showToggle).toBe(false);
  });
});
