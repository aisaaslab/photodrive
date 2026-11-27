import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { deleteUserGalleries } from "@/lib/server/repos/galleries";
import { usersCol } from "@/lib/server/repos/collections";
import { getUserDetail } from "@/lib/server/repos/admin-users";

/** Admin-only: everything the detail drawer shows for one user (S7-05): access, payments, galleries and the admin actions taken on them. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const { uid } = await params;
  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });
  const detail = await getUserDetail(uid);
  if (!detail) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json(detail);
}

/**
 * Admin-only: permanently delete a user account.
 *
 * Works directly — no need to revoke/ban first. Removes:
 * - the Firebase Auth account (sign-in disabled immediately),
 * - the Firestore `users/{uid}` profile / subscription doc,
 * - all galleries owned by the user, with their client favourites and submissions.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const adminUid = admin.user.uid;

  const { uid } = await params;
  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });
  if (uid === adminUid) {
    return NextResponse.json({ error: "You cannot delete your own admin account" }, { status: 400 });
  }

  const db = getAdminDb();
  const beforeProfile = (await usersCol(db).doc(uid).get()).data() ?? null;

  // Delete the Auth account first — 404 means it was already gone, which is
  // fine; we still clean up Firestore below.
  try {
    await getAdminAuth().deleteUser(uid);
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    if (!code.includes("user-not-found")) {
      console.error("[admin users] deleteUser failed", err);
      return NextResponse.json({ error: "Could not delete the account" }, { status: 500 });
    }
  }

  // Firestore profile.
  try {
    await usersCol(db).doc(uid).delete();
  } catch (err) {
    console.error("[admin users] delete profile failed", err);
  }

  // Owned galleries.
  try {
    await deleteUserGalleries(db, uid); // with their client favourites and submissions (S4-02)
  } catch (err) {
    console.error("[admin users] delete galleries failed", err);
  }

  await writeAudit({ actorUid: adminUid, action: "user.delete", targetType: "user", targetId: uid, before: beforeProfile });
  return NextResponse.json({ ok: true });
}
