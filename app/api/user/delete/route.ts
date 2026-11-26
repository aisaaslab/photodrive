import { route } from "@/lib/server/http";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/server/auth";
import { deleteUserGalleries } from "@/lib/server/repos/galleries";

export const DELETE = route("user.delete.delete", async (req: NextRequest) => {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const uid = auth.user.uid;

  const db = getAdminDb();
  // Every gallery with its client favourites and submissions (S4-02), then the profile.
  await deleteUserGalleries(db, uid);
  await db.collection("users").doc(uid).delete();

  // Stripe customer records are not deleted here — Stripe keeps its own
  // billing/transaction history for legal and accounting requirements.
  await getAdminAuth().deleteUser(uid);

  return NextResponse.json({ ok: true });
});
