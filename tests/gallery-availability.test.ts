import { describe, expect, it } from "vitest";
import { DAY_MS, LIFETIME_SENTINEL } from "@/lib/shared/billing-access";
import { GRACE_DAYS, GRACE_MS, dateFromExpiry, expiryFromDate, galleryAvailability, parseExpiryInput, planPhase } from "@/lib/gallery/availability";

const NOW = Date.UTC(2026, 10, 27, 12);

describe("planPhase (D3: 14 days of grace)", () => {
  it("the grace period is 14 days", () => expect(GRACE_DAYS).toBe(14));
  it("active until the plan ends", () => {
    expect(planPhase({ expiresAt: NOW + DAY_MS }, NOW)).toEqual({ phase: "active" });
  });
  it("in grace for 14 days after it ends, then lapsed", () => {
    const ended = NOW - 3 * DAY_MS;
    expect(planPhase({ expiresAt: ended }, NOW)).toEqual({ phase: "grace", graceEndsAt: ended + GRACE_MS });
    expect(planPhase({ expiresAt: NOW - 14 * DAY_MS + 1 }, NOW).phase).toBe("grace");
    expect(planPhase({ expiresAt: NOW - 14 * DAY_MS }, NOW).phase).toBe("lapsed");
    expect(planPhase({ expiresAt: NOW - 400 * DAY_MS }, NOW).phase).toBe("lapsed");
  });
  it("renewing brings it back at once", () => {
    expect(planPhase({ expiresAt: NOW - 400 * DAY_MS }, NOW).phase).toBe("lapsed");
    expect(planPhase({ expiresAt: NOW + 30 * DAY_MS }, NOW).phase).toBe("active");
  });
  it("lifetime, administrators and unknown accounts are never lapsed", () => {
    expect(planPhase({ expiresAt: LIFETIME_SENTINEL }, NOW).phase).toBe("active");
    expect(planPhase({ admin: true, expiresAt: 1 }, NOW).phase).toBe("active");
    for (const o of [null, undefined, {}, { expiresAt: null }, { expiresAt: 0 }, { expiresAt: Number.NaN }]) expect(planPhase(o, NOW).phase).toBe("active");
  });
});

describe("galleryAvailability", () => {
  const lapsed = { expiresAt: NOW - 30 * DAY_MS };
  const inGrace = { expiresAt: NOW - 2 * DAY_MS };
  const active = { expiresAt: NOW + 30 * DAY_MS };
  const check = (gallery: object, owner: object | null, enforceLapse = true) => galleryAvailability({ gallery, owner, enforceLapse, now: NOW });

  it("an ordinary gallery of an active plan is available", () => expect(check({}, active)).toEqual({ state: "available" }));
  it("switched off by an administrator", () => expect(check({ disabled: true }, active)).toEqual({ state: "unavailable", reason: "disabled" }));
  it("a gallery past its own expiry date is unavailable, even with a lifetime plan", () => {
    expect(check({ expiresAt: NOW - 1 }, { expiresAt: LIFETIME_SENTINEL })).toEqual({ state: "unavailable", reason: "expired" });
    expect(check({ expiresAt: NOW + 1 }, active)).toEqual({ state: "available" });
  });
  it("extending the date restores it", () => {
    expect(check({ expiresAt: NOW - 1 }, active).state).toBe("unavailable");
    expect(check({ expiresAt: NOW + 10 * DAY_MS }, active).state).toBe("available");
    expect(check({ expiresAt: null }, active).state).toBe("available");
  });
  it("grace: stays online, and says when it ends", () => {
    expect(check({}, inGrace)).toEqual({ state: "grace", graceEndsAt: inGrace.expiresAt + GRACE_MS });
  });
  it("lapsed past the grace period: unavailable, but only while enforcement is on", () => {
    expect(check({}, lapsed)).toEqual({ state: "unavailable", reason: "lapsed" });
    expect(check({}, lapsed, false)).toEqual({ state: "available" });
    expect(check({}, inGrace, false)).toEqual({ state: "available" });
  });
  it("renewal restores it", () => expect(check({}, active)).toEqual({ state: "available" }));
  it("administrator-disabled beats everything else", () => expect(check({ disabled: true, expiresAt: NOW - 1 }, lapsed).state).toBe("unavailable"));
});

describe("expiry dates", () => {
  it("a date ends at the end of that UTC day", () => {
    expect(expiryFromDate("2026-12-31")).toBe(Date.UTC(2026, 11, 31, 23, 59, 59, 999));
    expect(dateFromExpiry(expiryFromDate("2026-12-31"))).toBe("2026-12-31");
    expect(dateFromExpiry(null)).toBe("");
  });
  it("parses a request value: a real date sets it, empty clears it, junk is refused", () => {
    expect(parseExpiryInput("2026-12-31")).toEqual({ ok: true, value: Date.UTC(2026, 11, 31, 23, 59, 59, 999) });
    for (const v of ["", null, undefined]) expect(parseExpiryInput(v)).toEqual({ ok: true, value: null });
    for (const v of ["2026-02-30", "2026-13-01", "31/12/2026", "tomorrow", 5, {}, "2999-01-01", "2026-12-31T00:00"]) expect(parseExpiryInput(v), String(v)).toEqual({ ok: false });
  });
});
