import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getUidFromRequest, isAdmin } from "@/lib/firebase/admin-guard";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
// Far-future sentinel for "lifetime / comp" access (Jan 1, 3000)
const LIFETIME = 32503680000000;

/**
 * Admin-only: grant / extend / revoke a user's subscription manually
 * (e.g. give a registered photographer free access without payment).
 *
 * Body: { uid: string, action: "grant_lifetime" | "grant_year" | "revoke" }
 */
export async function POST(req: NextRequest) {
  const adminUid = await getUidFromRequest(req);
  if (!isAdmin(adminUid)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { uid, action } = await req.json();
  if (!uid || !action) {
    return NextResponse.json({ error: "Missing uid or action" }, { status: 400 });
  }

  const ref = getAdminDb().collection("users").doc(uid);
  const now = Date.now();

  if (action === "grant_lifetime") {
    await ref.set(
      { subscriptionStatus: "active", subscriptionExpiresAt: LIFETIME, compGranted: true },
      { merge: true }
    );
  } else if (action === "grant_year") {
    // Extend by a year from whichever is later: now or current expiry.
    const snap = await ref.get();
    const current = (snap.exists ? (snap.data()?.subscriptionExpiresAt as number) : 0) ?? 0;
    const base = Math.max(now, current);
    await ref.set(
      { subscriptionStatus: "active", subscriptionExpiresAt: base + YEAR_MS, compGranted: true },
      { merge: true }
    );
  } else if (action === "revoke") {
    await ref.set(
      { subscriptionStatus: "none", subscriptionExpiresAt: 0, compGranted: false },
      { merge: true }
    );
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
