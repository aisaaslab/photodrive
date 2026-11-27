import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { assignPlanToUser, getPlanById } from "@/lib/plans";
import { usersCol } from "@/lib/server/repos/collections";
import { USER_FILTERS, decodeCursor, listUsersPage, type UserFilter } from "@/lib/server/repos/admin-users";

/**
 * Admin-only: one page of users (S7-05). `?q=` searches e-mails by prefix, `?filter=` is all | active | expiring | lapsed | comped,
 * `?cursor=` continues a previous page, `?limit=` is 1 to 50 (default 25). Nothing here reads a whole collection.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  const params = new URL(req.url).searchParams;
  const filter = (params.get("filter") ?? "all") as UserFilter;
  if (!USER_FILTERS.includes(filter)) return NextResponse.json({ error: "Unknown filter" }, { status: 400 });
  const limit = Number(params.get("limit") ?? 25);
  const q = (params.get("q") ?? "").slice(0, 200);
  if (params.get("cursor") && !decodeCursor(params.get("cursor"))) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });

  const page = await listUsersPage({ q, filter, cursor: params.get("cursor"), limit: Number.isFinite(limit) ? limit : 25 });
  return NextResponse.json(page);
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
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const adminUid = admin.user.uid;

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
    if (!plan.active) {
      return NextResponse.json({ error: "This plan is inactive — activate it first in the Plans tab" }, { status: 400 });
    }
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
  await usersCol()
    .doc(created.uid)
    .set({ uid: created.uid, email, emailLower: email, name: displayName, createdAt: Date.now() });

  await writeAudit({ actorUid: adminUid, action: "user.create", targetType: "user", targetId: created.uid, after: { email, name: displayName, planId: planId ?? null } });

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
