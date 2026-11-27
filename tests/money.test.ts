import { describe, expect, it } from "vitest";
import { formatMoney, fromMinorUnits, minorUnitDigits } from "@/lib/shared/money";
import { fromMinorUnits as fromStripeModule } from "@/lib/server/billing/stripe";

// Intl separates the symbol and number with a no-break space in some locales; compare ignoring that.
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("minor units", () => {
  it("knows zero-, two- and three-decimal currencies, in any letter case", () => {
    expect(minorUnitDigits("jpy")).toBe(0);
    expect(minorUnitDigits("KRW")).toBe(0);
    expect(minorUnitDigits("usd")).toBe(2);
    expect(minorUnitDigits("EUR")).toBe(2);
    expect(minorUnitDigits("bhd")).toBe(3);
    expect(minorUnitDigits("KWD")).toBe(3);
  });

  it("converts to major units, and the Stripe module re-exports the same function", () => {
    expect(fromMinorUnits(9900, "usd")).toBe(99);
    expect(fromMinorUnits(1250, "usd")).toBe(12.5);
    expect(fromMinorUnits(500, "jpy")).toBe(500);
    expect(fromMinorUnits(1500, "bhd")).toBe(1.5);
    expect(fromStripeModule).toBe(fromMinorUnits);
  });
});

describe("formatMoney", () => {
  it("formats USD with cents, and trims whole amounts when asked", () => {
    expect(formatMoney(9900, "usd", "en-US")).toBe("$99.00");
    expect(formatMoney(9900, "usd", "en-US", { trimWholeNumbers: true })).toBe("$99");
    expect(formatMoney(9950, "usd", "en-US", { trimWholeNumbers: true })).toBe("$99.50");
    expect(formatMoney(0, "usd")).toBe("$0.00");
  });

  it("defaults to en-US and accepts any letter case for the currency", () => {
    expect(formatMoney(900, "USD")).toBe("$9.00");
    expect(formatMoney(900, "usd")).toBe("$9.00");
    expect(formatMoney(900, "")).toBe("$9.00"); // missing currency on old records means USD
  });

  it("follows the viewer's locale for each of the six app languages", () => {
    expect(plain(formatMoney(9900, "eur", "de-DE"))).toBe("99,00 €");
    expect(plain(formatMoney(9900, "eur", "nl-NL"))).toMatch(/^€ 99,00$/);
    expect(plain(formatMoney(9900, "eur", "el-GR"))).toBe("99,00 €");
    expect(plain(formatMoney(9900, "eur", "es-ES"))).toBe("99,00 €");
    expect(plain(formatMoney(9900, "eur", "it-IT"))).toBe("99,00 €");
    expect(formatMoney(9900, "gbp", "en-GB")).toBe("£99.00");
  });

  it("shows each plan in its own currency regardless of the viewer's locale (D4 option A)", () => {
    expect(plain(formatMoney(9900, "usd", "de-DE"))).toBe("99,00 $");
    expect(plain(formatMoney(9900, "eur", "en-US"))).toBe("€99.00");
  });

  it("handles zero-decimal currencies: no fraction, no x100 error", () => {
    expect(formatMoney(500, "jpy", "en-US")).toBe("¥500");
    expect(formatMoney(500, "jpy", "en-US", { trimWholeNumbers: true })).toBe("¥500");
    expect(plain(formatMoney(5000, "krw", "en-US"))).toBe("₩5,000");
    expect(plain(formatMoney(1250, "jpy", "de-DE"))).toBe("1.250 ¥");
  });

  it("handles three-decimal currencies", () => {
    expect(plain(formatMoney(1500, "bhd", "en-US"))).toBe("BHD 1.500");
    expect(plain(formatMoney(1500, "bhd", "en-US", { trimWholeNumbers: false }))).toBe("BHD 1.500");
  });

  it("formats refunds (negative amounts)", () => {
    expect(formatMoney(-500, "usd", "en-US")).toBe("-$5.00");
  });

  it("never throws: unknown currency falls back, bad amounts give a dash", () => {
    expect(formatMoney(9900, "xxxx", "en-US")).toBe("99.00 XXXX");
    expect(formatMoney(NaN, "usd")).toBe("—");
    expect(formatMoney(Infinity, "usd")).toBe("—");
    expect(formatMoney(9900, "usd", "not-a-locale")).toBe("$99.00"); // unknown but well-formed locale: Intl falls back
    expect(formatMoney(9900, "usd", "!!")).toBe("99.00 USD"); // malformed locale: Intl throws, we fall back
  });
});
