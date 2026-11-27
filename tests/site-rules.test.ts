import { describe, expect, it } from "vitest";
import { checkSupportEmail, checkTrackingId, isEmail } from "@/lib/shared/site-rules";
import { validateSupportEmail } from "@/lib/site-settings";
import { validateTrackingId } from "@/lib/tracking-settings";

describe("checkTrackingId", () => {
  it("accepts the three kinds of ID, tidies case and spaces, and treats empty as 'switched off'", () => {
    expect(checkTrackingId("gtmId", " gtm-abc123 ")).toEqual({ ok: true, value: "GTM-ABC123" });
    expect(checkTrackingId("googleAdsId", "aw-123456789")).toEqual({ ok: true, value: "AW-123456789" });
    expect(checkTrackingId("metaPixelId", "1234567890123456")).toEqual({ ok: true, value: "1234567890123456" });
    for (const f of ["gtmId", "googleAdsId", "metaPixelId"] as const) { expect(checkTrackingId(f, "")).toEqual({ ok: true, value: "" }); expect(checkTrackingId(f, null)).toEqual({ ok: true, value: "" }); }
  });
  it("refuses anything but a bare ID, in particular pasted script", () => {
    for (const bad of ["<script>alert(1)</script>", "GTM-", "GTM-ab cd", "GTM-ABCDEFGHIJKLM", "javascript:alert(1)", "GTM-ABC123\n<script>"]) expect(checkTrackingId("gtmId", bad).ok, bad).toBe(false);
    expect(checkTrackingId("metaPixelId", "123").ok).toBe(false);
    expect(checkTrackingId("metaPixelId", "12345abcde").ok).toBe(false);
    expect(checkTrackingId("googleAdsId", "AW-12").ok).toBe(false);
    const r = checkTrackingId("gtmId", "nope");
    expect(r.ok === false && r.error).toMatch(/Google Tag Manager ID looks invalid.*GTM-XXXXXXX/);
  });
});

describe("checkSupportEmail", () => {
  it("lower-cases and trims; refuses what is not an address", () => {
    expect(checkSupportEmail("  Help@Example.COM ")).toEqual({ ok: true, value: "help@example.com" });
    for (const bad of ["", "nope", "a@b", "a@b.c", "a b@c.de", `${"a".repeat(250)}@b.de`, null]) expect(checkSupportEmail(bad).ok, String(bad)).toBe(false);
    expect(isEmail("a@b.co")).toBe(true);
  });
});

describe("the server's validators are the shared rules (one definition)", () => {
  it("validateSupportEmail and validateTrackingId throw exactly the shared messages", () => {
    expect(validateSupportEmail("A@B.CO")).toBe("a@b.co");
    expect(() => validateSupportEmail("a@b.c")).toThrow("Enter a valid email address.");
    expect(validateTrackingId("gtmId", "gtm-xyz789")).toBe("GTM-XYZ789");
    expect(() => validateTrackingId("gtmId", "bad")).toThrow(/looks invalid/);
  });
});
