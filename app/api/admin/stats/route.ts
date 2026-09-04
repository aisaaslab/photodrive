import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { getUidFromRequest, isAdmin } from "@/lib/firebase/admin-guard";
import { listAllPlans } from "@/lib/plans";

const DAY = 24 * 60 * 60 * 1000;
// Far-future sentinel used for "lifetime / comp" access (Jan 1, 3000).
const LIFETIME = 32503680000000;

/** Overview numbers for the admin back office dashboard. */
export async function GET(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [listUsersResult, galleriesSnap, userDocs, paymentsSnap, plans] = await Promise.all([
    getAdminAuth().listUsers(1000),
    getAdminDb().collection("galleries").get(),
    getAdminDb().collection("users").get(),
    getAdminDb().collection("payments").get(),
    listAllPlans(),
  ]);

  const now = Date.now();
  const userDocMap = new Map(userDocs.docs.map((d) => [d.id, d.data() ?? {}]));
  const users = listUsersResult.users.map((u) => {
    const doc = userDocMap.get(u.uid) ?? {};
    const expiresAt = (doc.subscriptionExpiresAt as number | undefined) ?? 0;
    const isActive = doc.subscriptionStatus === "active" && expiresAt > now;
    return {
      uid: u.uid,
      email: u.email ?? "",
      displayName: (doc.name as string) || u.displayName || "",
      photoURL: u.photoURL ?? null,
      createdAt: u.metadata.creationTime,
      lastSignIn: u.metadata.lastSignInTime,
      subscriptionActive: isActive,
      subscriptionExpiresAt: expiresAt || null,
      compGranted: doc.compGranted === true,
      planInterval: (doc.planInterval as string | undefined) ?? null,
      planName: (doc.planName as string | undefined) ?? null,
    };
  });

  const tsOf = (s: string) => {
    const t = new Date(s).getTime();
    return Number.isNaN(t) ? 0 : t;
  };

  const activeSubs = users.filter((u) => u.subscriptionActive);
  const monthlySubs = activeSubs.filter((u) => u.planInterval === "monthly").length;
  const yearlySubs = activeSubs.filter((u) => u.planInterval === "yearly").length;

  // Real revenue: sum of recorded Stripe payments (cents → currency units).
  // Mixed currencies are summed per currency; the USD total is reported.
  let revenueUsd = 0;
  let paymentCount = 0;
  for (const doc of paymentsSnap.docs) {
    const d = doc.data();
    const amount = (d.amountTotal as number | null | undefined) ?? null;
    const currency = (d.currency as string | undefined) ?? "usd";
    if (amount !== null && currency === "usd") {
      revenueUsd += amount / 100;
      paymentCount += 1;
    }
  }

  const expiringSoon = users
    .filter(
      (u) =>
        u.subscriptionActive &&
        u.subscriptionExpiresAt != null &&
        u.subscriptionExpiresAt < LIFETIME &&
        u.subscriptionExpiresAt - now <= 30 * DAY
    )
    .map((u) => ({
      ...u,
      daysLeft: Math.max(0, Math.ceil((u.subscriptionExpiresAt! - now) / DAY)),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 10)
    .map((u) => ({
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      photoURL: u.photoURL,
      expiresAt: u.subscriptionExpiresAt,
      daysLeft: u.daysLeft,
      planName: u.planName,
    }));

  const recentUsers = [...users]
    .sort((a, b) => tsOf(b.createdAt) - tsOf(a.createdAt))
    .slice(0, 5)
    .map((u) => ({
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      photoURL: u.photoURL,
      createdAt: u.createdAt,
      subscriptionActive: u.subscriptionActive,
    }));

  return NextResponse.json({
    stats: {
      totalUsers: users.length,
      newUsers7d: users.filter((u) => { const t = tsOf(u.createdAt); return t > 0 && now - t <= 7 * DAY; }).length,
      newUsers30d: users.filter((u) => { const t = tsOf(u.createdAt); return t > 0 && now - t <= 30 * DAY; }).length,
      activeSubscriptions: activeSubs.length,
      monthlySubscriptions: monthlySubs,
      yearlySubscriptions: yearlySubs,
      compSubscriptions: activeSubs.filter((u) => u.compGranted).length,
      totalGalleries: galleriesSnap.size,
      newGalleries30d: galleriesSnap.docs.filter((d) => { const t = (d.data().createdAt as number | undefined) ?? 0; return t > 0 && now - t <= 30 * DAY; }).length,
      revenueUsd: Math.round(revenueUsd * 100) / 100,
      paymentCount,
      expiringSoonCount: expiringSoon.length,
      planCount: plans.length,
      publicPlanCount: plans.filter((p) => p.active && p.isPublic).length,
    },
    expiringSoon,
    recentUsers,
  });
}
