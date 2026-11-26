import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { listPublicPlans } from "@/lib/plans";
import type { PublicPlan } from "@/lib/shared/pricing";
import { createLogger } from "@/lib/server/log";

/** Cache tag of the public plan list; the admin plan routes expire it so a change shows on the landing page at once (S6-02). */
export const PUBLIC_PLANS_TAG = "public-plans";

const readPlans = async (): Promise<PublicPlan[]> =>
  (await listPublicPlans()).map((p) => ({
    id: p.id, name: p.name, description: p.description ?? "", interval: p.interval, priceCents: p.priceCents,
    currency: p.currency, features: p.features, highlight: p.highlight === true, sortOrder: p.sortOrder,
  }));

// A read that throws is not cached, so a Firestore outage never pins an empty price list for five minutes.
const cachedPlans = unstable_cache(readPlans, ["public-plans"], { tags: [PUBLIC_PLANS_TAG], revalidate: 300 });

/** The plans the landing page shows, from the cache (at most five minutes old, expired on every admin plan change). Empty if unreadable. */
export async function getPublicPlans(): Promise<PublicPlan[]> {
  try {
    return await cachedPlans();
  } catch (err) {
    createLogger({ scope: "public-plans" }).error("could not read public plans", { err: String(err) });
    return [];
  }
}

/** Called by the admin plan routes after any change. Never throws: a failed expiry only means the page catches up within the cache window. */
export function expirePublicPlans(): void {
  try {
    revalidateTag(PUBLIC_PLANS_TAG, { expire: 0 });
  } catch (err) {
    createLogger({ scope: "public-plans" }).warn("could not expire the plan cache", { err: String(err) });
  }
}
