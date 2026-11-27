import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { paymentSummary } from "@/lib/server/repos/admin-payments";

/** Admin-only: totals per currency for the last 30 days and how many items need attention (S8-01). Never summed across currencies. */
export const GET = route("admin.payments.summary", async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  return NextResponse.json(await paymentSummary());
});
