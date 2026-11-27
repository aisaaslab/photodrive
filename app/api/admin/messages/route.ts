import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { contactMessagesCol } from "@/lib/server/repos/collections";

/** GET: latest contact-form messages for the admin inbox. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

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
