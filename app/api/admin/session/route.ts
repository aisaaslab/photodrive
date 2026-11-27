import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";

/** Lightweight admin check used by the back-office layout guard. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  return NextResponse.json({ ok: true });
}
