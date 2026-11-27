/**
 * Rules for the values an administrator can set under Settings (S8-04). Pure, so the form checks as you type with exactly the rules the
 * server enforces.
 */
export type TrackingField = "gtmId" | "googleAdsId" | "metaPixelId";
export const TRACKING_FIELDS: readonly TrackingField[] = ["gtmId", "googleAdsId", "metaPixelId"];

export const TRACKING_PATTERNS: Record<TrackingField, { re: RegExp; label: string; example: string }> = {
  gtmId: { re: /^GTM-[A-Z0-9]{4,12}$/, label: "Google Tag Manager ID", example: "GTM-XXXXXXX" },
  googleAdsId: { re: /^AW-\d{6,15}$/, label: "Google Ads tag ID", example: "AW-123456789" },
  metaPixelId: { re: /^\d{10,20}$/, label: "Meta Pixel ID", example: "1234567890123456" },
};

export type Checked = { ok: true; value: string } | { ok: false; error: string };

/**
 * One tracking ID. An empty value is valid and means "switched off". Only the bare ID is accepted, never pasted script, so a
 * compromised administrator session cannot inject JavaScript into every visitor's page.
 */
export function checkTrackingId(field: TrackingField, value: unknown): Checked {
  const v = String(value ?? "").trim();
  if (v === "") return { ok: true, value: "" };
  const { re, label, example } = TRACKING_PATTERNS[field];
  const normalized = field === "metaPixelId" ? v : v.toUpperCase();
  return re.test(normalized) ? { ok: true, value: normalized } : { ok: false, error: `${label} looks invalid. Expected something like ${example}, or leave empty to switch it off.` };
}

/** An address with something before the @, a dot in the domain and a last part of at least two characters. */
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export function checkSupportEmail(value: unknown): Checked {
  const v = String(value ?? "").trim().toLowerCase();
  return isEmail(v) && v.length <= 254 ? { ok: true, value: v } : { ok: false, error: "Enter a valid email address." };
}
