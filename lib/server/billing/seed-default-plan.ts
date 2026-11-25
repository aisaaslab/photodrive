import type { Firestore } from "firebase-admin/firestore";
import type { PlanDoc } from "@/lib/firestore/types";

export const DEFAULT_PLAN_ID = "default-annual";

/** The plan that replaces the old hard-coded "$99 / year" checkout (S1-07). */
export function defaultPlan(now: number): PlanDoc {
  return {
    id: DEFAULT_PLAN_ID,
    name: "Annual",
    description: "",
    interval: "yearly",
    priceCents: 9900,
    currency: "usd",
    features: [
      "Unlimited galleries",
      "Unlimited photos & videos",
      "Password per gallery",
      "No client account needed",
      "Client favorites",
      "Full resolution download",
      "Photos stay in your Drive",
    ],
    isPublic: true,
    active: true,
    highlight: false,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export type SeedResult =
  | { action: "create"; applied: boolean; plan: PlanDoc }
  | { action: "skip"; reason: "already_seeded" | "other_plans_exist"; existingPlanIds: string[] };

/**
 * Creates the default Annual plan only when there are NO plans at all, so a shop that already
 * manages its own plans in the back office is never touched. Dry run unless `apply` is true.
 */
export async function seedDefaultPlan(
  db: Firestore,
  { apply = false, now = Date.now() }: { apply?: boolean; now?: number } = {},
): Promise<SeedResult> {
  const snap = await db.collection("plans").get();
  const ids = snap.docs.map((d) => d.id);
  if (ids.includes(DEFAULT_PLAN_ID)) return { action: "skip", reason: "already_seeded", existingPlanIds: ids };
  if (ids.length > 0) return { action: "skip", reason: "other_plans_exist", existingPlanIds: ids };

  const plan = defaultPlan(now);
  if (apply) {
    const { id, ...data } = plan;
    await db.collection("plans").doc(id).create(data);
  }
  return { action: "create", applied: apply, plan };
}
