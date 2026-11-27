import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { PAYMENT_FILTERS, decodeCursor, listPaymentsPage } from "@/lib/server/repos/admin-payments";
import type { PaymentFilter } from "@/lib/shared/admin-payments";

/**
 * Admin-only: one page of payments, newest first (S8-01). `?filter=` is all | paid | free_code | refunded | disputed | needs_review,
 * `?q=` is a Checkout Session id (or its start), a payment id (`pi_…`) or a customer's e-mail (its start), `?cursor=` continues a page,
 * `?limit=` is 1 to 50 (default 25). A search returns its matches without paging.
 */
export const GET = route("admin.payments.list", async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  const params = new URL(req.url).searchParams;
  const filter = (params.get("filter") ?? "all") as PaymentFilter;
  if (!PAYMENT_FILTERS.includes(filter)) return NextResponse.json({ error: "Unknown filter" }, { status: 400 });
  if (params.get("cursor") && !decodeCursor(params.get("cursor"))) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  const limit = Number(params.get("limit") ?? 25);

  return NextResponse.json(await listPaymentsPage({ q: (params.get("q") ?? "").slice(0, 200), filter, cursor: params.get("cursor"), limit: Number.isFinite(limit) ? limit : 25 }));
});
