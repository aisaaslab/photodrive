import { NextRequest, NextResponse } from "next/server";
import { cronAuthorised } from "@/lib/server/cron-auth";
import { recomputeOverview } from "@/lib/server/repos/stats";
import { requestLogger } from "@/lib/server/log";

export const maxDuration = 60;

/** Nightly truth for the admin overview (S7-04): recompute every number from the database and store it. Vercel Cron, authorised with CRON_SECRET. */
export async function GET(req: NextRequest) {
  const log = requestLogger(req, "cron.stats-recompute");
  const ok = cronAuthorised(req);
  if (ok === null) {
    log.error("CRON_SECRET is not set: refusing to run");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { stats } = await recomputeOverview();
    log.info("overview recomputed", { totalUsers: stats.totalUsers, activeSubscriptions: stats.activeSubscriptions });
    return NextResponse.json({ ok: true, totalUsers: stats.totalUsers });
  } catch (err) {
    log.error("overview recompute failed", { err });
    return NextResponse.json({ error: "Recompute failed" }, { status: 500 });
  }
}
