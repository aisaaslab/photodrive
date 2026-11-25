import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { isAdmin } from "@/lib/firebase/admin-guard";
import { billingFulfilV2 } from "@/lib/server/billing/flags";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);

    // Admin always has access
    if (isAdmin(decoded.uid)) {
      return NextResponse.json({ isActive: true, status: "admin", expiresAt: null });
    }

    const snap = await getAdminDb().collection("users").doc(decoded.uid).get();
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
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
