import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { assignPlanToUser, getPlanById } from "@/lib/plans";
import { LIFETIME_SENTINEL, YEAR_MS } from "@/lib/shared/billing-access";
import { extendUserAccess } from "@/lib/server/billing/extend";
import { parseJson } from "@/lib/server/http";
import { AdminSubscriptionBody } from "@/lib/shared/schemas/admin";
import { usersCol } from "@/lib/server/repos/collections";

/**
 * Admin-only: manage a user's subscription manually.
 *
 * Body: { uid: string, action: "assign_plan" | "grant_lifetime" | "grant_year" | "revoke", planId?: string }
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const adminUid = admin.user.uid;

  const body = await parseJson(req, AdminSubscriptionBody, { message: "Missing or invalid uid or action" });
  if (!body.ok) return body.response;
  const { uid, action, planId } = body.data;

  const ref = usersCol().doc(uid);
  // What an administrator can change about access: recorded before and after in the audit log.
  const accessOf = (d: Record<string, unknown> | undefined) => ({
    subscriptionStatus: d?.subscriptionStatus ?? null, subscriptionExpiresAt: d?.subscriptionExpiresAt ?? null,
    compGranted: d?.compGranted ?? false, planId: d?.planId ?? null, planName: d?.planName ?? null, planInterval: d?.planInterval ?? null,
  });
  const beforeAccess = accessOf((await ref.get()).data());
  const audit = async () => writeAudit({
    actorUid: adminUid, action: `subscription.${action}`, targetType: "user", targetId: uid,
    before: beforeAccess, after: accessOf((await ref.get()).data()), ...(planId && { note: `plan ${planId}` }),
  });

  if (action === "assign_plan") {
    if (!planId) return NextResponse.json({ error: "Missing planId" }, { status: 400 });
    const plan = await getPlanById(planId);
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 400 });
    if (!plan.active) {
      return NextResponse.json({ error: "This plan is inactive — activate it first in the Plans tab" }, { status: 400 });
    }
    const expiresAt = await assignPlanToUser(uid, plan);
    await audit();
    return NextResponse.json({ ok: true, expiresAt, plan: { id: plan.id, name: plan.name, interval: plan.interval } });
  } else if (action === "grant_lifetime") {
    await ref.set(
      { subscriptionStatus: "active", subscriptionExpiresAt: LIFETIME_SENTINEL, compGranted: true },
      { merge: true }
    );
  } else if (action === "grant_year") {
    // Same rule as a purchase: stack a year on top of the later of now / current expiry.
    await extendUserAccess(getAdminDb(), uid, { grantedMs: YEAR_MS });
  } else if (action === "revoke") {
    await ref.set(
      {
        subscriptionStatus: "none",
        subscriptionExpiresAt: 0,
        compGranted: false,
        planId: null,
        planName: null,
        planInterval: null,
      },
      { merge: true }
    );
  }

  await audit();
  return NextResponse.json({ ok: true });
}
