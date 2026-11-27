import { route } from "@/lib/server/http";
import { reminderMode } from "@/lib/server/reminders";
import { GRACE_DAYS } from "@/lib/gallery/availability";
import { lapseEnforced } from "@/lib/server/gallery-availability";
import { NextRequest, NextResponse } from "next/server";
import { isAdminToken, requireUser } from "@/lib/server/auth";
import { billingFulfilV2 } from "@/lib/server/billing/flags";
import { usersCol } from "@/lib/server/repos/collections";

export const GET = route("user.subscription.get", async (req: NextRequest) => {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const { uid } = auth.user;

  // Admin always has access
  if (isAdminToken(auth.user)) {
    return NextResponse.json({ isActive: true, status: "admin", expiresAt: null });
  }

  const snap = await usersCol().doc(uid).get();
  const data = snap.data();

  const status = data?.subscriptionStatus ?? "none";
  const expiresAt: number = data?.subscriptionExpiresAt ?? 0;
  const isActive = status === "active" && expiresAt > Date.now();

  return NextResponse.json({
    isActive,
    status,
    expiresAt,
    // What happens to galleries after the plan ends (D3, S9-04): offline after `graceDays`, only while enforcement is on. The dashboard
    // words its notice from this, so it never promises something that is not happening.
    lapse: { enforced: lapseEnforced(), graceDays: GRACE_DAYS },
    // For the billing page (S9-02): whether an administrator granted this access by hand, how it was obtained, and whether renewal
    // reminder e-mails are really being sent (so the page only promises them when they are).
    comped: data?.compGranted === true,
    source: data?.subscriptionSource === "paid" || data?.subscriptionSource === "free_code" ? data.subscriptionSource : null,
    reminders: reminderMode() === "send",
    // True once purchases made while active extend the subscription (BILLING_FULFIL_V2).
    // Until then the subscribe page keeps sending active users to the dashboard.
    canRenewEarly: billingFulfilV2(),
    planName: typeof data?.planName === "string" ? data.planName : null,
    planInterval: typeof data?.planInterval === "string" ? data.planInterval : null,
  });
});
