import "server-only";
// Server-only helper (import from server components / API routes only).
import { unstable_cache } from "next/cache";
import { siteSettingsDoc } from "@/lib/server/repos/collections";
import { checkTrackingId, type TrackingField } from "@/lib/shared/site-rules";

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

export type { TrackingField };

/**
 * Validates one tracking ID (the rules are in lib/shared/site-rules.ts, shared with the Settings form). Empty string is valid and means
 * "disabled". Throws a message the caller can return as a 400.
 */
export function validateTrackingId(field: TrackingField, value: unknown): string {
  const r = checkTrackingId(field, value);
  if (!r.ok) throw new Error(r.error);
  return r.value;
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
    const snap = await siteSettingsDoc().get();
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
