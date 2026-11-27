import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { getPaymentDetail } from "@/lib/server/repos/admin-payments";

/** Admin-only: one payment in full (S8-01): its record, the customer, the Stripe events that touched it and what administrators did. */
export const GET = route("admin.payments.detail", async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const { id } = await params;
  const detail = await getPaymentDetail(id);
  if (!detail) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  return NextResponse.json(detail);
});
