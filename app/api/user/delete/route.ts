import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export async function DELETE(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  const galleries = await db.collection("galleries").where("photographerId", "==", uid).get();

  const batch = db.batch();
  galleries.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(db.collection("users").doc(uid));
  await batch.commit();

  // Stripe customer records are not deleted here — Stripe keeps its own
  // billing/transaction history for legal and accounting requirements.
  await getAdminAuth().deleteUser(uid);

  return NextResponse.json({ ok: true });
}
