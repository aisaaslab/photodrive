import { NextRequest, NextResponse } from "next/server";
import { getUidFromRequest, isAdmin } from "@/lib/firebase/admin-guard";

/** Lightweight admin check used by the back-office layout guard. */
export async function GET(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
