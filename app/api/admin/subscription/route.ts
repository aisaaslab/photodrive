import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getUidFromRequest, isAdmin } from "@/lib/firebase/admin-guard";
import { assignPlanToUser, getPlanById } from "@/lib/plans";
import { LIFETIME_SENTINEL, YEAR_MS } from "@/lib/server/billing/access";
import { extendUserAccess } from "@/lib/server/billing/extend";
import { parseJson } from "@/lib/server/http";
import { AdminSubscriptionBody } from "@/lib/shared/schemas/admin";

/**
 * Admin-only: manage a user's subscription manually.
 *
 * Body: { uid: string, action: "assign_plan" | "grant_lifetime" | "grant_year" | "revoke", planId?: string }
 */
export async function POST(req: NextRequest) {
  const adminUid = await getUidFromRequest(req);
  if (!isAdmin(adminUid)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await parseJson(req, AdminSubscriptionBody, { message: "Missing or invalid uid or action" });
  if (!body.ok) return body.response;
  const { uid, action, planId } = body.data;

  const ref = getAdminDb().collection("users").doc(uid);

  if (action === "assign_plan") {
    if (!planId) return NextResponse.json({ error: "Missing planId" }, { status: 400 });
    const plan = await getPlanById(planId);
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 400 });
    if (!plan.active) {
      return NextResponse.json({ error: "This plan is inactive — activate it first in the Plans tab" }, { status: 400 });
    }
    const expiresAt = await assignPlanToUser(uid, plan);
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

  return NextResponse.json({ ok: true });
}
