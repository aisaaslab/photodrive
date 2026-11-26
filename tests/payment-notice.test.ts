import { describe, expect, it } from "vitest";
import { BANNER_WINDOW_MS, dismissKey, pickBanner, type UserPayment } from "@/lib/payment-notice";
import { LANGUAGES } from "@/lib/i18n/languages";
import { translations } from "@/lib/i18n";

const NOW = Date.UTC(2026, 10, 26);
const DAY = 86_400_000;
const pay = (over: Partial<UserPayment> & Pick<UserPayment, "sessionId">): UserPayment => ({
  amountTotal: 9900, currency: "usd", activatedAt: NOW - 60 * DAY, status: "fulfilled", refundedAmount: null, changedAt: null, ...over,
});

describe("pickBanner (which payment to tell the customer about)", () => {
  it("says nothing when every payment is fine", () => {
    expect(pickBanner([pay({ sessionId: "a" }), pay({ sessionId: "b" })], NOW)).toBeNull();
    expect(pickBanner([], NOW)).toBeNull();
  });

  it("an open dispute is always shown, however old", () => {
    const p = pay({ sessionId: "d", status: "disputed", changedAt: NOW - 400 * DAY });
    expect(pickBanner([p], NOW)).toBe(p);
  });

  it("a refund or a lost dispute is shown for 30 days, then drops off", () => {
    for (const status of ["refunded", "dispute_lost"] as const) {
      const recent = pay({ sessionId: "r", status, changedAt: NOW - 29 * DAY });
      const old = pay({ sessionId: "o", status, changedAt: NOW - BANNER_WINDOW_MS - DAY });
      expect(pickBanner([recent], NOW), status).toBe(recent);
      expect(pickBanner([old], NOW), status).toBeNull();
    }
  });

  it("when the time of the change is unknown it is still shown (once, until dismissed)", () => {
    expect(pickBanner([pay({ sessionId: "u", status: "refunded", changedAt: null })], NOW)?.sessionId).toBe("u");
  });

  it("a partial refund never makes a banner: access did not change", () => {
    expect(pickBanner([pay({ sessionId: "p", status: "partially_refunded", changedAt: NOW - DAY })], NOW)).toBeNull();
  });

  it("shows the most serious first (open dispute, lost dispute, refund), then the newest", () => {
    const refund = pay({ sessionId: "ref", status: "refunded", changedAt: NOW - DAY });
    const lost = pay({ sessionId: "lost", status: "dispute_lost", changedAt: NOW - 5 * DAY });
    const open = pay({ sessionId: "open", status: "disputed", changedAt: NOW - 9 * DAY });
    expect(pickBanner([refund, lost, open], NOW)?.sessionId).toBe("open");
    expect(pickBanner([refund, lost], NOW)?.sessionId).toBe("lost");
    const older = pay({ sessionId: "older", status: "refunded", changedAt: NOW - 10 * DAY });
    expect(pickBanner([older, refund], NOW)?.sessionId).toBe("ref");
  });

  it("a dismissed message stays dismissed, and the next one takes its place", () => {
    const lost = pay({ sessionId: "lost", status: "dispute_lost", changedAt: NOW - DAY });
    const refund = pay({ sessionId: "ref", status: "refunded", changedAt: NOW - 2 * DAY });
    const dismissed = new Set([dismissKey(lost)]);
    expect(pickBanner([lost, refund], NOW, (k) => dismissed.has(k))?.sessionId).toBe("ref");
    dismissed.add(dismissKey(refund));
    expect(pickBanner([lost, refund], NOW, (k) => dismissed.has(k))).toBeNull();
  });

  it("dismissal is per payment AND status: a refund after a dismissed dispute is news again", () => {
    expect(dismissKey({ sessionId: "x", status: "disputed" })).not.toBe(dismissKey({ sessionId: "x", status: "refunded" }));
    const nowRefunded = pay({ sessionId: "x", status: "refunded", changedAt: NOW - DAY });
    expect(pickBanner([nowRefunded], NOW, (k) => k === dismissKey({ sessionId: "x", status: "disputed" }))).toBe(nowRefunded);
  });
});

describe("customer-facing copy for payment status (S2-15)", () => {
  const section = (lang: (typeof LANGUAGES)[number], name: string) =>
    (translations[lang] as unknown as Record<string, Record<string, string>>)[name];
  const accountKeys = [
    "paymentRefunded", "paymentPartlyRefunded", "paymentDisputed", "paymentDisputeLost",
    "paymentRefundedNote", "paymentPartlyRefundedNote", "paymentDisputedNote", "paymentDisputeLostNote",
  ];
  const dashKeys = ["paymentBannerRefunded", "paymentBannerDisputed", "paymentBannerDisputeLost", "paymentBannerDetails", "paymentBannerDismiss"];

  it("every language has every string, non-empty", () => {
    for (const lang of LANGUAGES) {
      for (const k of accountKeys) expect(section(lang, "account")[k]?.length, `${lang}.account.${k}`).toBeGreaterThan(3);
      for (const k of dashKeys) expect(section(lang, "dashboard")[k]?.length, `${lang}.dashboard.${k}`).toBeGreaterThan(3);
    }
  });

  it("the amount placeholders are there where the code fills them in", () => {
    for (const lang of LANGUAGES) {
      expect(section(lang, "account").paymentPartlyRefundedNote, lang).toContain("{amount}");
      for (const k of ["paymentBannerRefunded", "paymentBannerDisputed", "paymentBannerDisputeLost"]) expect(section(lang, "dashboard")[k], `${lang}.${k}`).toContain("{amount}");
    }
  });

  it("the four statuses are named differently in every language", () => {
    for (const lang of LANGUAGES) {
      const names = ["paymentRefunded", "paymentPartlyRefunded", "paymentDisputed", "paymentDisputeLost"].map((k) => section(lang, "account")[k]);
      expect(new Set(names).size, lang).toBe(4);
    }
  });
});
