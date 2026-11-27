import "server-only";
import { getAdminDb } from "@/lib/firebase/admin";
import type { PlanDoc, PlanInterval } from "@/lib/firestore/types";
import { periodMs } from "@/lib/shared/billing-access";
import { extendUserAccess } from "@/lib/server/billing/extend";
import { plansCol } from "@/lib/server/repos/collections";

// Monthly access runs 30 days, yearly 365 — both are one-time payments (no
// auto-renew), matching the product's existing billing model. The rule lives in
// lib/shared/billing-access.ts so customer and admin paths cannot drift apart.
export function planPeriodMs(interval: PlanInterval): number {
  return periodMs(interval);
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
  const snap = await plansCol().get();
  return snap.docs.map((d) => toPlan(d.id, d.data() as Record<string, unknown>)).sort(bySortOrder);
}

export async function listPublicPlans(): Promise<PlanDoc[]> {
  const all = await listAllPlans();
  return all.filter((p) => p.active && p.isPublic);
}

export async function getPlanById(id: string): Promise<PlanDoc | null> {
  if (!id) return null;
  const snap = await plansCol().doc(id).get();
  if (!snap.exists) return null;
  return toPlan(snap.id, snap.data() as Record<string, unknown>);
}

/**
 * Writes a plan assignment to the user's document so it takes effect
 * immediately: subscription becomes active and expiry is extended by the
 * plan's period from whichever is later — now or the current expiry.
 */
export async function assignPlanToUser(uid: string, plan: PlanDoc, now: number = Date.now()): Promise<number> {
  return extendUserAccess(getAdminDb(), uid, {
    grantedMs: periodMs(plan.interval),
    now,
    fields: { planId: plan.id, planName: plan.name, planInterval: plan.interval },
  });
}
