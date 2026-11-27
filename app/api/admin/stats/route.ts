import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { readOverview } from "@/lib/server/repos/stats";

/**
 * Overview numbers for the admin back office (S7-04). Reads one stored document; it is recomputed from Firestore aggregation queries when
 * it is older than ten minutes (and nightly by the cron). Nothing here reads a whole collection. `?refresh=1` forces a recompute (ignored when the numbers are under 30 seconds old).
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const { overview, cached } = await readOverview(undefined, Date.now(), { refresh: req.nextUrl.searchParams.get("refresh") === "1" });
  return NextResponse.json({ stats: overview.stats, expiringSoon: overview.expiringSoon, recentUsers: overview.recentUsers, computedAt: overview.computedAt, cached });
}
