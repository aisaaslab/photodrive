import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { getUidFromRequest, isAdmin } from "@/lib/firebase/admin-guard";

/**
 * Admin-only: permanently delete a user account.
 *
 * Works directly — no need to revoke/ban first. Removes:
 * - the Firebase Auth account (sign-in disabled immediately),
 * - the Firestore `users/{uid}` profile / subscription doc,
 * - all galleries owned by the user.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const adminUid = await getUidFromRequest(req);
  if (!isAdmin(adminUid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { uid } = await params;
  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });
  if (uid === adminUid) {
    return NextResponse.json({ error: "You cannot delete your own admin account" }, { status: 400 });
  }

  const db = getAdminDb();

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
    await db.collection("users").doc(uid).delete();
  } catch (err) {
    console.error("[admin users] delete profile failed", err);
  }

  // Owned galleries.
  try {
    const snap = await db.collection("galleries").where("photographerId", "==", uid).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (err) {
    console.error("[admin users] delete galleries failed", err);
  }

  return NextResponse.json({ ok: true });
}
