import { describe, expect, it } from "vitest";
import { matchesPaymentFilter, paymentStatus, stripeDashboardUrl, totalsByCurrency } from "@/lib/shared/admin-payments";

describe("paymentStatus", () => {
  it("is fulfilled unless a refund or dispute is recorded, including for old payments with no status", () => {
    expect(paymentStatus({})).toBe("fulfilled");
    expect(paymentStatus({ status: "weird" })).toBe("fulfilled");
    for (const s of ["refunded", "partially_refunded", "disputed", "dispute_lost"]) expect(paymentStatus({ status: s })).toBe(s);
  });
});

describe("matchesPaymentFilter", () => {
  const paid = { status: "fulfilled", source: "paid" };
  const free = { status: "fulfilled", source: "free_code" };
  it("paid excludes free-code payments and anything refunded or disputed; old payments count as paid", () => {
    expect(matchesPaymentFilter("paid", paid)).toBe(true);
    expect(matchesPaymentFilter("paid", {})).toBe(true);
    expect(matchesPaymentFilter("paid", free)).toBe(false);
    expect(matchesPaymentFilter("paid", { status: "refunded" })).toBe(false);
  });
  it("free_code, refunded, disputed and needs_review pick what they say", () => {
    expect(matchesPaymentFilter("free_code", free)).toBe(true);
    expect(matchesPaymentFilter("free_code", paid)).toBe(false);
    expect(matchesPaymentFilter("refunded", { status: "partially_refunded" })).toBe(true);
    expect(matchesPaymentFilter("refunded", { status: "disputed" })).toBe(false);
    expect(matchesPaymentFilter("disputed", { status: "dispute_lost" })).toBe(true);
    expect(matchesPaymentFilter("needs_review", { ...paid, needsReview: true })).toBe(true);
    expect(matchesPaymentFilter("needs_review", paid)).toBe(false);
  });
  it("all keeps everything", () => expect(matchesPaymentFilter("all", {})).toBe(true));
});

describe("totalsByCurrency (never summed across currencies)", () => {
  it("groups by currency, counts refunds, and leaves free codes out", () => {
    const t = totalsByCurrency([
      { currency: "usd", amountTotal: 9900, source: "paid" },
      { currency: "USD", amountTotal: 1200, source: "paid", status: "refunded", refundedAmount: 1200 },
      { currency: "usd", amountTotal: 9900, source: "paid", status: "partially_refunded", refundedAmount: 2500 },
      { currency: "eur", amountTotal: 8900, source: "paid" },
      { currency: "usd", amountTotal: 0, source: "free_code" },
      { currency: "usd", amountTotal: 5000, source: "paid", status: "dispute_lost" },
      { currency: "usd", amountTotal: 3000, source: "paid", status: "disputed" },
    ]);
    expect(t).toEqual([
      { currency: "usd", gross: 9900 + 1200 + 9900 + 5000 + 3000, refunded: 1200 + 2500 + 5000, net: 9900 + 0 + 7400 + 0 + 3000, count: 5 },
      { currency: "eur", gross: 8900, refunded: 0, net: 8900, count: 1 },
    ]);
  });
  it("a full refund with no recorded amount takes back the whole payment; a refund can never exceed the payment", () => {
    expect(totalsByCurrency([{ currency: "usd", amountTotal: 1000, status: "refunded" }])[0]).toMatchObject({ refunded: 1000, net: 0 });
    expect(totalsByCurrency([{ currency: "usd", amountTotal: 1000, status: "partially_refunded", refundedAmount: 5000 }])[0]).toMatchObject({ refunded: 1000, net: 0 });
  });
  it("ignores junk amounts, defaults a missing currency, and is empty for nothing", () => {
    expect(totalsByCurrency([])).toEqual([]);
    expect(totalsByCurrency([{ amountTotal: -5 }, { amountTotal: "x" }, { amountTotal: Number.NaN }])).toEqual([]);
    expect(totalsByCurrency([{ amountTotal: 700 }])[0].currency).toBe("usd");
  });
});

describe("stripeDashboardUrl", () => {
  it("links the payment when there is one, in test or live mode", () => {
    expect(stripeDashboardUrl({ paymentIntentId: "pi_123", livemode: true })).toBe("https://dashboard.stripe.com/payments/pi_123");
    expect(stripeDashboardUrl({ paymentIntentId: "pi_123", livemode: false })).toBe("https://dashboard.stripe.com/test/payments/pi_123");
  });
  it("searches for the session when there is no payment, and reads the mode from the id when it was not recorded", () => {
    expect(stripeDashboardUrl({ sessionId: "cs_test_abc" })).toBe("https://dashboard.stripe.com/test/search?query=cs_test_abc");
    expect(stripeDashboardUrl({ sessionId: "cs_live_abc" })).toBe("https://dashboard.stripe.com/search?query=cs_live_abc");
    expect(stripeDashboardUrl({ sessionId: "cs_live_abc", livemode: false })).toContain("/test/");
  });
  it("is null with nothing to look up", () => expect(stripeDashboardUrl({})).toBeNull());
});

import { outcomeLabel } from "@/lib/shared/admin-payments";
describe("outcomeLabel", () => {
  it("names the known outcomes, makes unknown ones readable, and never shows nothing", () => {
    expect(outcomeLabel("unmatched_payment")).toBe("Paid, but no customer matched");
    expect(outcomeLabel("refund_partial_flagged")).toBe("Partial refund");
    expect(outcomeLabel("some_new_outcome")).toBe("Some new outcome");
    expect(outcomeLabel(null)).toBe("Needs review");
  });
});
