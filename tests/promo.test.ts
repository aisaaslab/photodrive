import { describe, expect, it } from "vitest";
import { CODE_RE, MAX_ACCESS_DAYS, humanDays, normalizeCode, validAccessDays } from "@/lib/shared/promo";
import { PromoCreateBody, PromoUpdateBody } from "@/lib/shared/schemas/promo";

describe("promo rules", () => {
  it("normalizeCode tidies what was typed", () => {
    expect(normalizeCode(" free year ")).toBe("FREEYEAR");
    expect(normalizeCode("spring-2026")).toBe("SPRING-2026");
    for (const junk of [null, undefined, 5, {}]) expect(normalizeCode(junk)).toBe("");
  });
  it("the code pattern allows 2–40 letters, digits, - and _", () => {
    for (const ok of ["AB", "FREE_YEAR-1", "A".repeat(40)]) expect(CODE_RE.test(ok), ok).toBe(true);
    for (const bad of ["A", "A".repeat(41), "A B", "É1", "A!"]) expect(CODE_RE.test(bad), bad).toBe(false);
  });
  it("validAccessDays is a whole number of days within bounds", () => {
    expect(validAccessDays(365)).toBe(365);
    expect(validAccessDays("30")).toBe(30);
    expect(validAccessDays(30.9)).toBe(30);
    for (const bad of [0, -1, MAX_ACCESS_DAYS + 1, "abc", NaN, null, undefined, {}]) expect(validAccessDays(bad), String(bad)).toBeNull();
  });
  it("humanDays says it in years, months or days", () => {
    expect([365, 730, 30, 90, 45, 1].map(humanDays)).toEqual(["1 year", "2 years", "1 month", "3 months", "45 days", "1 day"]);
  });
});

describe("promo schemas", () => {
  it("create: tidies the code, accepts days as a number or text, defaults the note", () => {
    expect(PromoCreateBody.parse({ code: " free year ", accessDays: "365" })).toEqual({ code: "FREEYEAR", accessDays: 365, note: "" });
    expect(PromoCreateBody.parse({ code: "ab", accessDays: 30, note: "  beta " }).note).toBe("beta");
  });
  it("create: says what is wrong", () => {
    const msg = (v: unknown) => { const r = PromoCreateBody.safeParse(v); return r.success ? [] : r.error.issues.map((i) => i.message); };
    expect(msg({ code: "x", accessDays: 30 })).toEqual(["Code must be 2–40 letters, numbers, - or _."]);
    expect(msg({ code: "OKAY", accessDays: 0 })).toEqual([`Access length must be 1–${MAX_ACCESS_DAYS} days.`]);
    expect(msg({ code: "OKAY" }).length).toBeGreaterThan(0);
    expect(msg({ code: "OKAY", accessDays: 30, note: "x".repeat(201) }).length).toBeGreaterThan(0);
  });
  it("update: any one field, but at least one", () => {
    expect(PromoUpdateBody.safeParse({ active: false }).success).toBe(true);
    expect(PromoUpdateBody.safeParse({ accessDays: "90" }).success).toBe(true);
    expect(PromoUpdateBody.safeParse({ note: "" }).success).toBe(true);
    for (const bad of [{}, { accessDays: 0 }, { active: "yes" }]) expect(PromoUpdateBody.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
});
