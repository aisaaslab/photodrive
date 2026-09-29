// Server-only helper (import from server components / API routes only).
import { unstable_cache } from "next/cache";
import { getAdminDb } from "@/lib/firebase/admin";
import { SITE_SETTINGS_DOC } from "@/lib/site-settings";

/** Cache tag — bust it after saving so changes reach the site right away. */
export const SITE_SETTINGS_TAG = "site-settings";

// Values that were hardcoded in app/layout.tsx before these became
// admin-managed. Used only while nothing has ever been saved in the admin, so
// tracking keeps working across the switch-over. Saving an empty value in the
// admin turns that tag off (it does NOT fall back to the default again).
export const DEFAULT_GTM_ID = "GTM-5789H3DW";
export const DEFAULT_GOOGLE_ADS_ID = "AW-18467164685";
export const DEFAULT_META_PIXEL_ID = "";

export type TrackingIds = {
  gtmId: string;
  googleAdsId: string;
  metaPixelId: string;
};

export type TrackingField = keyof TrackingIds;

const PATTERNS: Record<TrackingField, { re: RegExp; label: string; example: string }> = {
  gtmId: { re: /^GTM-[A-Z0-9]{4,12}$/, label: "Google Tag Manager ID", example: "GTM-XXXXXXX" },
  googleAdsId: { re: /^AW-\d{6,15}$/, label: "Google Ads tag ID", example: "AW-123456789" },
  metaPixelId: { re: /^\d{10,20}$/, label: "Meta Pixel ID", example: "1234567890123456" },
};

/**
 * Validates one tracking ID. Empty string is valid and means "disabled".
 * Only the bare ID is accepted — never pasted script — so a compromised admin
 * session can't inject arbitrary JavaScript into every visitor's page.
 */
export function validateTrackingId(field: TrackingField, value: unknown): string {
  const v = String(value ?? "").trim();
  if (v === "") return "";
  const { re, label, example } = PATTERNS[field];
  const normalized = field === "metaPixelId" ? v : v.toUpperCase();
  if (!re.test(normalized)) {
    throw new Error(`${label} looks invalid. Expected something like ${example}, or leave empty to disable.`);
  }
  return normalized;
}

const DEFAULTS: TrackingIds = {
  gtmId: DEFAULT_GTM_ID,
  googleAdsId: DEFAULT_GOOGLE_ADS_ID,
  metaPixelId: DEFAULT_META_PIXEL_ID,
};

/** Fresh (uncached) read: stored value wins, even when empty; default otherwise. */
export async function readTrackingIds(): Promise<TrackingIds> {
  const out = { ...DEFAULTS };
  try {
    const snap = await getAdminDb().doc(SITE_SETTINGS_DOC).get();
    const data = snap.exists ? snap.data() : undefined;
    for (const field of Object.keys(DEFAULTS) as TrackingField[]) {
      const stored = data?.[field];
      if (typeof stored !== "string") continue;
      // Re-validate on read so a bad hand-edited Firestore value can never
      // reach the page markup.
      try {
        out[field] = validateTrackingId(field, stored);
      } catch {
        out[field] = "";
      }
    }
  } catch {
    // Firestore unavailable (or no credentials at build time) — defaults.
  }
  return out;
}

/** Cached read used by the root layout (max 5 min stale; busted on save). */
export const getTrackingIds = unstable_cache(readTrackingIds, ["tracking-ids"], {
  tags: [SITE_SETTINGS_TAG],
  revalidate: 300,
});
