import { NextRequest, NextResponse } from "next/server";
import { getUidFromRequest, isAdmin } from "@/lib/firebase/admin-guard";
import { contactMessagesCol } from "@/lib/server/repos/collections";

/** GET: latest contact-form messages for the admin inbox. */
export async function GET(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit") || 50) || 50,
    200
  );
  const snap = await contactMessagesCol()
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return NextResponse.json({
    messages: snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })),
  });
}
