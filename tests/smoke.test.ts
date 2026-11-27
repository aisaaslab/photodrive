import { describe, expect, it } from "vitest";
import { fromMinorUnits, isSessionSettled } from "@/lib/server/billing/stripe";

describe("smoke: @/ alias and pure Stripe helpers", () => {
  it("converts minor units, including zero-decimal currencies", () => {
    expect(fromMinorUnits(9900, "usd")).toBe(99);
    expect(fromMinorUnits(500, "JPY")).toBe(500);
  });

  it("treats paid and no_payment_required as settled", () => {
    expect(isSessionSettled({ payment_status: "paid" })).toBe(true);
    expect(isSessionSettled({ payment_status: "no_payment_required" })).toBe(true);
    expect(isSessionSettled({ payment_status: "unpaid" })).toBe(false);
  });
});
