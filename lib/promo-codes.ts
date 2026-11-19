// Server-only helper (import from API routes only — never from client code).
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Free-code access rules, managed in the back office (Admin → Promo codes).
 *
 * A 100%-off Stripe code only makes checkout free; it doesn't say how long the
 * access lasts (that would otherwise come from whichever plan the person
 * picked, so a "1 year free" code used on the monthly plan gave 30 days). A
 * rule here fixes the length per code: `promoCodes/{CODE}` → `accessDays`.
 *
 * Resolution order for a $0 checkout (see lib/stripe/activate.ts):
 *   1. an active back-office rule for the code
 *   2. an `access_days` field on the Stripe promotion code / coupon (metadata)
 *   3. the length of the plan that was chosen (previous behavior)
 */

export const PROMO_COLLECTION = "promoCodes";
export const MIN_ACCESS_DAYS = 1;
export const MAX_ACCESS_DAYS = 3650; // 10 years

export function normalizeCode(code: unknown): string {
  return typeof code === "string" ? code.trim().toUpperCase().replace(/\s+/g, "") : "";
}

/** A whole number of days within bounds, or null. */
export function validAccessDays(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const d = Math.trunc(n);
  return d >= MIN_ACCESS_DAYS && d <= MAX_ACCESS_DAYS ? d : null;
}

export type AccessGrant = { days: number; source: "back_office" | "stripe" };

export async function resolveAccessDays(
  code: string | null,
  stripeMetaDays?: unknown
): Promise<AccessGrant | null> {
  const key = normalizeCode(code);
  if (key) {
    try {
      const snap = await getAdminDb().collection(PROMO_COLLECTION).doc(key).get();
      if (snap.exists && snap.data()?.active !== false) {
        const days = validAccessDays(snap.data()?.accessDays);
        if (days) return { days, source: "back_office" };
      }
    } catch (err) {
      console.error("[promo-codes] rule lookup failed for", key, err);
    }
  }
  const fromStripe = validAccessDays(stripeMetaDays);
  return fromStripe ? { days: fromStripe, source: "stripe" } : null;
}
