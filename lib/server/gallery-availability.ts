import "server-only";
import { isAdmin } from "@/lib/server/auth";
import { usersCol } from "@/lib/server/repos/collections";
import { galleryAvailability, planPhase, type Availability, type OwnerPlan } from "@/lib/gallery/availability";

/**
 * The server's answer to "may visitors see this gallery?" (S9-04, S9-05, D3), used by the public page and every public route, so they
 * cannot disagree. The rules are the pure ones in lib/gallery/availability.ts; this adds the owner's plan lookup.
 *
 * A lapsed plan takes galleries offline only when `GALLERY_LAPSE_ENFORCE=1` (off until the owner switches it on, like the other new
 * behaviours): with it off, only an administrator's switch-off and the gallery's own expiry date apply, and the owner is not even
 * read. A plan that is active is cached for 30 seconds per server instance, because a busy gallery asks for every photo; a plan in
 * grace or lapsed is never cached. So a renewal brings the galleries back on the very next request, on every server, and the only
 * delay is up to 30 seconds before a newly ended plan is noticed (it then has 14 days of grace anyway).
 */
export const lapseEnforced = () => process.env.GALLERY_LAPSE_ENFORCE === "1";

const OWNER_TTL_MS = 30_000;
const cache = new Map<string, { at: number; plan: OwnerPlan }>();

export async function ownerPlanOf(uid: string, now = Date.now()): Promise<OwnerPlan> {
  if (isAdmin(uid)) return { admin: true };
  const hit = cache.get(uid);
  if (hit && now - hit.at < OWNER_TTL_MS) return hit.plan;
  const snap = await usersCol().doc(uid).get();
  const exp = snap.data()?.subscriptionExpiresAt;
  const plan: OwnerPlan = { expiresAt: typeof exp === "number" ? exp : null };
  if (planPhase(plan, now).phase === "active") {
    if (cache.size > 5000) cache.clear();
    cache.set(uid, { at: now, plan });
  }
  return plan;
}

/** Forget a cached plan (used by tests; a renewal needs no call, because only active plans are cached). */
export const forgetOwnerPlan = (uid?: string) => (uid ? cache.delete(uid) : cache.clear());

/** The availability of a gallery document (the owner is read only while lapse enforcement is on). */
export async function availabilityOf(
  gallery: { photographerId?: unknown; disabled?: unknown; expiresAt?: unknown },
  now = Date.now(),
): Promise<Availability> {
  const enforceLapse = lapseEnforced();
  const owner = enforceLapse && typeof gallery.photographerId === "string" ? await ownerPlanOf(gallery.photographerId, now) : null;
  return galleryAvailability({ gallery, owner, enforceLapse, now });
}

export const isUnavailable = (a: Availability) => a.state === "unavailable";
