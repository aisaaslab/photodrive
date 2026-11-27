import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { attentionQueue } from "@/lib/server/repos/admin-payments";

/**
 * Admin-only: the "needs attention" queue (S8-01): Stripe events and payments still waiting for a person (a payment that could not be
 * matched to a customer, a partial refund, an open dispute, ...), oldest first, with the customer's e-mail and a Stripe link.
 */
export const GET = route("admin.payments.attention", async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  return NextResponse.json(await attentionQueue());
});
