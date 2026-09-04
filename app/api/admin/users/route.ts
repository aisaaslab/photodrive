import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { getUidFromRequest, isAdmin } from "@/lib/firebase/admin-guard";
import { assignPlanToUser, getPlanById } from "@/lib/plans";
import type { GalleryDoc } from "@/lib/firestore/types";

export async function GET(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [listUsersResult, galleriesSnap] = await Promise.all([
    getAdminAuth().listUsers(1000),
    getAdminDb().collection("galleries").get(),
  ]);

  // Firestore returns untyped documents, so the shape is asserted rather than
  // inferred — spreading Record<string, unknown> yields just { id } to tsc.
  const galleries = galleriesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, unknown>),
  })) as unknown as GalleryDoc[];

  // Count galleries per photographer
  const galleryCounts: Record<string, number> = {};
  const latestGallery: Record<string, number> = {};
  for (const g of galleries) {
    const pid = g.photographerId;
    if (!pid) continue;
    galleryCounts[pid] = (galleryCounts[pid] ?? 0) + 1;
    if ((g.createdAt ?? 0) > (latestGallery[pid] ?? 0)) {
      latestGallery[pid] = g.createdAt;
    }
  }

  // Fetch subscription data from Firestore for all users. The Firestore
  // `name` is also preferred for displayName — it's the source of truth the
  // user can edit in Account settings (Auth displayName is the Google name).
  const userDocs = await getAdminDb().collection("users").get();
  const subMap: Record<string, { status: string; expiresAt: number; comp: boolean; name?: string; planId?: string; planName?: string; planInterval?: string }> = {};
  for (const doc of userDocs.docs) {
    const d = doc.data();
    subMap[doc.id] = {
      status: d.subscriptionStatus ?? "none",
      expiresAt: d.subscriptionExpiresAt ?? 0,
      comp: d.compGranted === true,
      name: typeof d.name === "string" && d.name ? d.name : undefined,
      planId: typeof d.planId === "string" ? d.planId : undefined,
      planName: typeof d.planName === "string" ? d.planName : undefined,
      planInterval: typeof d.planInterval === "string" ? d.planInterval : undefined,
    };
  }

  const now = Date.now();
  const users = listUsersResult.users.map((u) => {
    const sub = subMap[u.uid];
    const isActive = sub?.status === "active" && sub?.expiresAt > now;
    return {
      uid: u.uid,
      email: u.email ?? "",
      displayName: sub?.name ?? u.displayName ?? "",
      photoURL: u.photoURL ?? null,
      createdAt: u.metadata.creationTime,
      lastSignIn: u.metadata.lastSignInTime,
      galleryCount: galleryCounts[u.uid] ?? 0,
      lastGalleryAt: latestGallery[u.uid] ?? null,
      subscriptionActive: isActive,
      subscriptionExpiresAt: sub?.expiresAt ?? null,
      compGranted: sub?.comp ?? false,
      planId: sub?.planId ?? null,
      planName: sub?.planName ?? null,
      planInterval: sub?.planInterval ?? null,
    };
  });

  // Sort by gallery count desc
  users.sort((a, b) => b.galleryCount - a.galleryCount);

  return NextResponse.json({ users });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function randomPassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * Admin-only: create a user account (email/password) from the back office.
 *
 * Body: { email, displayName, password?, planId? }
 * - password: optional — auto-generated when omitted; the generated value is
 *   returned ONCE so the admin can share it with the user.
 * - planId: optional — immediately assigns the plan to the new account.
 */
export async function POST(req: NextRequest) {
  const adminUid = await getUidFromRequest(req);
  if (!isAdmin(adminUid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const displayName = String(body.displayName ?? "").trim();
  const planId = typeof body.planId === "string" && body.planId ? body.planId : null;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }
  if (!displayName) {
    return NextResponse.json({ error: "Please enter a display name" }, { status: 400 });
  }

  let password = typeof body.password === "string" && body.password ? body.password : "";
  let generated = false;
  if (!password) {
    password = randomPassword();
    generated = true;
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  if (planId) {
    const plan = await getPlanById(planId);
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 400 });
  }

  let created;
  try {
    created = await getAdminAuth().createUser({ email, password, displayName });
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    if (code.includes("email-already-exists")) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }
    if (code.includes("invalid-password")) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
    if (code.includes("operation-not-allowed")) {
      return NextResponse.json(
        { error: "Email/Password sign-in is not enabled on the Firebase project (Authentication → Sign-in method)" },
        { status: 400 }
      );
    }
    console.error("[admin users] createUser failed", err);
    return NextResponse.json({ error: "Could not create the account" }, { status: 500 });
  }

  // Firestore profile (mirrors what upsertUser creates on first login).
  await getAdminDb()
    .collection("users")
    .doc(created.uid)
    .set({ uid: created.uid, email, name: displayName, createdAt: Date.now() });

  let assignedPlan: { id: string; name: string; interval: string; expiresAt: number } | null = null;
  if (planId) {
    const plan = await getPlanById(planId);
    if (plan) {
      const expiresAt = await assignPlanToUser(created.uid, plan);
      assignedPlan = { id: plan.id, name: plan.name, interval: plan.interval, expiresAt };
    }
  }

  return NextResponse.json({
    user: { uid: created.uid, email, displayName },
    ...(generated ? { generatedPassword: password } : {}),
    ...(assignedPlan ? { assignedPlan } : {}),
  });
}
