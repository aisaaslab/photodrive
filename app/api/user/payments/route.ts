import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isAdmin } from "@/lib/firebase/admin-guard";
import { getUidFromRequest } from "@/lib/firebase/admin-guard";

/**
 * Payment history for the signed-in user, read from the `payments` collection
 * written by the subscription activator (webhook + verify route). Powers the
 * payment confirmation list on the account page.
 */
export async function GET(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isAdmin(uid)) {
    // Admin doesn't pay — return an empty list rather than "inactive".
    return NextResponse.json({ payments: [] });
  }

  const snap = await getAdminDb()
    .collection("payments")
    .where("uid", "==", uid)
    .orderBy("activatedAt", "desc")
    .limit(20)
    .get();

  const payments = snap.docs.map((d) => {
    const data = d.data();
    return {
      sessionId: data.sessionId ?? d.id,
      amountTotal: typeof data.amountTotal === "number" ? data.amountTotal : null,
      currency: typeof data.currency === "string" ? data.currency : null,
      activatedAt: typeof data.activatedAt === "number" ? data.activatedAt : null,
    };
  });

  return NextResponse.json({ payments });
}
