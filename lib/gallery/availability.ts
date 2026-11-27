import { DAY_MS, isLifetime } from "@/lib/shared/billing-access";

/**
 * When is a gallery shown to visitors? Pure rules, no I/O and no clock (callers pass `now`), shared by the server routes, the dashboard
 * and the tests (S9-04, S9-05, decision D3).
 *
 * A gallery is unavailable when:
 *  - an administrator switched it off (`disabled`, S7-06);
 *  - its own expiry date has passed (`expiresAt`, S9-05: the photographer's choice);
 *  - its owner's plan ended more than 14 days ago (D3, only while lapse enforcement is on).
 * In the 14 days after a plan ends (the grace period) the gallery stays online and the owner is told. Nothing is ever deleted, and
 * renewing makes everything available again at once. An owner with no recorded expiry (older accounts) is never treated as lapsed.
 */
export const GRACE_DAYS = 14;
export const GRACE_MS = GRACE_DAYS * DAY_MS;

/** What the availability rules need to know about the gallery's owner. */
export type OwnerPlan = { admin?: boolean; expiresAt?: number | null };

export type PlanPhase = { phase: "active" } | { phase: "grace"; graceEndsAt: number } | { phase: "lapsed" };

const validTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

export function planPhase(owner: OwnerPlan | null | undefined, now: number): PlanPhase {
  if (!owner || owner.admin) return { phase: "active" };
  const exp = owner.expiresAt;
  if (!validTime(exp)) return { phase: "active" }; // nothing recorded: never punish an account we know nothing about
  if (isLifetime(exp) || exp > now) return { phase: "active" };
  const graceEndsAt = exp + GRACE_MS;
  return now < graceEndsAt ? { phase: "grace", graceEndsAt } : { phase: "lapsed" };
}

export type UnavailableReason = "disabled" | "expired" | "lapsed";
export type Availability =
  | { state: "available" }
  | { state: "grace"; graceEndsAt: number }
  | { state: "unavailable"; reason: UnavailableReason };

export function galleryAvailability(input: {
  gallery: { disabled?: unknown; expiresAt?: unknown };
  owner?: OwnerPlan | null;
  /** Whether a lapsed plan takes galleries offline (GALLERY_LAPSE_ENFORCE); when off, a lapsed plan changes nothing. */
  enforceLapse: boolean;
  now: number;
}): Availability {
  const { gallery, owner, enforceLapse, now } = input;
  if (gallery.disabled === true) return { state: "unavailable", reason: "disabled" };
  if (validTime(gallery.expiresAt) && gallery.expiresAt <= now) return { state: "unavailable", reason: "expired" };
  if (!enforceLapse) return { state: "available" };
  const p = planPhase(owner, now);
  if (p.phase === "lapsed") return { state: "unavailable", reason: "lapsed" };
  if (p.phase === "grace") return { state: "grace", graceEndsAt: p.graceEndsAt };
  return { state: "available" };
}

/** A gallery's own expiry is chosen as a date; it ends at the end of that day (UTC). */
export const expiryFromDate = (date: string): number => Date.parse(`${date}T23:59:59.999Z`);
export const dateFromExpiry = (ms: number | null | undefined): string => (validTime(ms) ? new Date(ms).toISOString().slice(0, 10) : "");

/** Reads an `expiresAt` from a request: a real "YYYY-MM-DD" date sets it, an empty value or null clears it, anything else is refused. */
export function parseExpiryInput(v: unknown): { ok: true; value: number | null } | { ok: false } {
  if (v === null || v === undefined || v === "") return { ok: true, value: null };
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false };
  const ms = expiryFromDate(v);
  if (!Number.isFinite(ms) || dateFromExpiry(ms) !== v || ms >= 4_102_444_800_000) return { ok: false }; // not a real day, or past 2100
  return { ok: true, value: ms };
}
