import { describe, expect, it } from "vitest";
import { DAY_MS, LIFETIME_SENTINEL } from "@/lib/shared/billing-access";
import { GRACE_MS } from "@/lib/gallery/availability";
import { billingSummary, renewalNudgeDays } from "@/lib/shared/billing-state";

const NOW = Date.UTC(2026, 10, 27, 12);
const at = (days: number) => NOW + days * DAY_MS;
const sum = (over: object, enforced = true) => billingSummary({ lapseEnforced: enforced, now: NOW, ...over });

describe("billingSummary: every state", () => {
  it("admin: no plan needed", () => expect(sum({ admin: true, expiresAt: 1 })).toMatchObject({ state: "admin", daysLeft: null }));
  it("none: never subscribed", () => {
    for (const e of [undefined, null, 0, -1, Number.NaN]) expect(sum({ expiresAt: e }).state, String(e)).toBe("none");
  });
  it("lifetime: nothing to renew", () => expect(sum({ expiresAt: LIFETIME_SENTINEL })).toMatchObject({ state: "lifetime", daysLeft: null }));
  it("comped: access granted by hand, still running", () => expect(sum({ expiresAt: at(100), comped: true })).toEqual({ state: "comped", daysLeft: 100, graceEndsAt: null, galleriesOffline: false }));
  it("active: a running plan with time to spare", () => expect(sum({ expiresAt: at(100), interval: "yearly" })).toMatchObject({ state: "active", daysLeft: 100 }));

  it("expiring: the last week of a monthly plan, the last month of any other", () => {
    expect(sum({ expiresAt: at(7), interval: "monthly" }).state).toBe("expiring");
    expect(sum({ expiresAt: at(8), interval: "monthly" }).state).toBe("active");
    expect(sum({ expiresAt: at(30), interval: "yearly" }).state).toBe("expiring");
    expect(sum({ expiresAt: at(31), interval: "yearly" }).state).toBe("active");
    expect(sum({ expiresAt: at(30) }).state).toBe("expiring"); // no interval recorded: treated like a long plan
    expect(renewalNudgeDays("monthly")).toBe(7);
    expect(renewalNudgeDays("yearly")).toBe(30);
  });

  it("counts whole days, rounding up, and a plan with hours left still has one day", () => {
    expect(sum({ expiresAt: NOW + 3 * 3_600_000, interval: "monthly" })).toMatchObject({ state: "expiring", daysLeft: 1 });
  });

  it("grace (lapse enforcement on): ended, galleries still online, with the date they stay until", () => {
    const ended = at(-3);
    expect(sum({ expiresAt: ended })).toEqual({ state: "grace", daysLeft: 0, graceEndsAt: ended + GRACE_MS, galleriesOffline: false });
  });

  it("lapsed with enforcement on: past the grace period, galleries offline for visitors", () => {
    expect(sum({ expiresAt: at(-15) })).toEqual({ state: "lapsed", daysLeft: 0, graceEndsAt: null, galleriesOffline: true });
    expect(sum({ expiresAt: at(-14) }).state).toBe("lapsed");
    expect(sum({ expiresAt: at(-13) }).state).toBe("grace");
  });

  it("lapsed with enforcement off: just ended, nothing happens to the galleries, and there is no grace to speak of", () => {
    for (const d of [-1, -5, -200]) expect(sum({ expiresAt: at(d) }, false)).toEqual({ state: "lapsed", daysLeft: 0, graceEndsAt: null, galleriesOffline: false });
  });

  it("a hand-granted plan that has ended is an ordinary ended plan", () => {
    expect(sum({ expiresAt: at(-3), comped: true }).state).toBe("grace");
  });

  it("renewing brings an ended plan back to active", () => {
    expect(sum({ expiresAt: at(-40) }).state).toBe("lapsed");
    expect(sum({ expiresAt: at(325), interval: "yearly" }).state).toBe("active");
  });
});
