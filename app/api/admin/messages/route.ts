import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getUidFromRequest, isAdmin } from "@/lib/firebase/admin-guard";

/** GET: latest contact-form messages for the admin inbox. */
export async function GET(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit") || 50) || 50,
    200
  );
  const snap = await getAdminDb()
    .collection("contactMessages")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return NextResponse.json({
    messages: snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })),
  });
}
