import { route } from "@/lib/server/http";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isAdmin, requireUser } from "@/lib/server/auth";
import { billingFulfilV2 } from "@/lib/server/billing/flags";

export const GET = route("user.subscription.get", async (req: NextRequest) => {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const { uid } = auth.user;

  // Admin always has access
  if (isAdmin(uid)) {
    return NextResponse.json({ isActive: true, status: "admin", expiresAt: null });
  }

  const snap = await getAdminDb().collection("users").doc(uid).get();
  const data = snap.data();

  const status = data?.subscriptionStatus ?? "none";
  const expiresAt: number = data?.subscriptionExpiresAt ?? 0;
  const isActive = status === "active" && expiresAt > Date.now();

  return NextResponse.json({
    isActive,
    status,
    expiresAt,
    // True once purchases made while active extend the subscription (BILLING_FULFIL_V2).
    // Until then the subscribe page keeps sending active users to the dashboard.
    canRenewEarly: billingFulfilV2(),
    planName: typeof data?.planName === "string" ? data.planName : null,
    planInterval: typeof data?.planInterval === "string" ? data.planInterval : null,
  });
});
