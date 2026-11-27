import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { readOverview } from "@/lib/server/repos/stats";

/**
 * Overview numbers for the admin back office (S7-04). Reads one stored document; it is recomputed from Firestore aggregation queries when
 * it is older than ten minutes (and nightly by the cron). Nothing here reads a whole collection. Add `?refresh=1` to force a recompute.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const { overview, cached } = await readOverview();
  return NextResponse.json({ stats: overview.stats, expiringSoon: overview.expiringSoon, recentUsers: overview.recentUsers, computedAt: overview.computedAt, cached });
}
