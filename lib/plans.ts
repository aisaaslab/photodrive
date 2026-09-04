import { getAdminDb } from "@/lib/firebase/admin";
import type { PlanDoc, PlanInterval } from "@/lib/firestore/types";

// Monthly access runs 30 days, yearly 365 — both are one-time payments (no
// auto-renew), matching the product's existing billing model.
const PERIOD_MS: Record<PlanInterval, number> = {
  monthly: 30 * 24 * 60 * 60 * 1000,
  yearly: 365 * 24 * 60 * 60 * 1000,
};

export function planPeriodMs(interval: PlanInterval): number {
  return PERIOD_MS[interval] ?? PERIOD_MS.yearly;
}

function toPlan(id: string, data: Record<string, unknown>): PlanDoc {
  return {
    id,
    name: (data.name as string) ?? "",
    description: (data.description as string) ?? "",
    interval: data.interval === "monthly" ? "monthly" : "yearly",
    priceCents: (data.priceCents as number) ?? 0,
    currency: (data.currency as string) ?? "usd",
    features: Array.isArray(data.features) ? (data.features as string[]) : [],
    isPublic: data.isPublic === true,
    active: data.active !== false,
    highlight: data.highlight === true,
    sortOrder: (data.sortOrder as number) ?? 0,
    createdAt: (data.createdAt as number) ?? 0,
    updatedAt: (data.updatedAt as number) ?? 0,
  };
}

const bySortOrder = (a: PlanDoc, b: PlanDoc) =>
  a.sortOrder - b.sortOrder || a.priceCents - b.priceCents || a.name.localeCompare(b.name, "en");

export async function listAllPlans(): Promise<PlanDoc[]> {
  const snap = await getAdminDb().collection("plans").get();
  return snap.docs.map((d) => toPlan(d.id, d.data() as Record<string, unknown>)).sort(bySortOrder);
}

export async function listPublicPlans(): Promise<PlanDoc[]> {
  const all = await listAllPlans();
  return all.filter((p) => p.active && p.isPublic);
}

export async function getPlanById(id: string): Promise<PlanDoc | null> {
  if (!id) return null;
  const snap = await getAdminDb().collection("plans").doc(id).get();
  if (!snap.exists) return null;
  return toPlan(snap.id, snap.data() as Record<string, unknown>);
}

/**
 * Validates and normalizes plan input coming from the admin back office.
 * Returns null-shaped errors as thrown Error messages the caller can return
 * as a 400.
 */
export function normalizePlanInput(body: Record<string, unknown>): {
  name: string;
  description: string;
  interval: PlanInterval;
  priceCents: number;
  features: string[];
  isPublic: boolean;
  active: boolean;
  highlight: boolean;
  sortOrder: number;
} {
  const name = String(body.name ?? "").trim();
  if (!name) throw new Error("Plan name is required");

  const interval: PlanInterval = body.interval === "monthly" ? "monthly" : "yearly";

  const price = Number(body.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Price must be a positive number");
  const priceCents = Math.round(price * 100);
  if (priceCents > 99_999_999) throw new Error("Price is too large");

  const features = Array.isArray(body.features)
    ? (body.features as unknown[]).map((f) => String(f).trim()).filter(Boolean)
    : [];

  const sortOrder = Number(body.sortOrder ?? 0);

  return {
    name,
    description: String(body.description ?? "").trim(),
    interval,
    priceCents,
    features,
    isPublic: body.isPublic === true,
    active: body.active !== false,
    highlight: body.highlight === true,
    sortOrder: Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : 0,
  };
}

/**
 * Writes a plan assignment to the user's document so it takes effect
 * immediately: subscription becomes active and expiry is extended by the
 * plan's period from whichever is later — now or the current expiry.
 */
export async function assignPlanToUser(uid: string, plan: PlanDoc): Promise<number> {
  const ref = getAdminDb().collection("users").doc(uid);
  const now = Date.now();

  const snap = await ref.get();
  const current = (snap.data()?.subscriptionExpiresAt as number | undefined) ?? 0;
  const base = Math.max(now, current);
  const expiresAt = base + planPeriodMs(plan.interval);

  await ref.set(
    {
      subscriptionStatus: "active",
      subscriptionExpiresAt: expiresAt,
      planId: plan.id,
      planName: plan.name,
      planInterval: plan.interval,
      compGranted: true,
    },
    { merge: true }
  );

  return expiresAt;
}
