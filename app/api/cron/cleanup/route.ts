import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { cronAuthorised } from "@/lib/server/cron-auth";
import { cleanupExpiredDemos } from "@/lib/server/cleanup";
import { requestLogger } from "@/lib/server/log";

export const maxDuration = 60;

/**
 * Daily housekeeping (S3-07). Deletes demo galleries that expired more than a day ago. Firestore's TTL policy on
 * `demo_galleries.expiresAtTs` does the same job, but it can lag by a day or more and is a setting someone has to switch on,
 * so this is the guarantee. Vercel Cron (see vercel.json), authorised with CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const log = requestLogger(req, "cron.cleanup");
  const ok = cronAuthorised(req);
  if (ok === null) {
    log.error("CRON_SECRET is not set: refusing to run");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const deletedDemos = await cleanupExpiredDemos(getAdminDb());
    log.info("cleanup finished", { deletedDemos });
    return NextResponse.json({ deletedDemos });
  } catch (err) {
    log.error("cleanup failed", { err });
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
