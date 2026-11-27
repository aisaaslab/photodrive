import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { attentionCounts } from "@/lib/server/repos/admin-attention";

/** Admin-only: how many payment items and support messages need a person right now (S8-04). Live, never cached; counts only. */
export const GET = route("admin.attention", async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  return NextResponse.json(await attentionCounts(), { headers: { "Cache-Control": "private, no-store" } });
});
