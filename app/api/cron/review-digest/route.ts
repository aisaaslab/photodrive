import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { cronAuthorised } from "@/lib/server/cron-auth";
import { sendReviewDigest } from "@/lib/server/billing/review";
import { requestLogger } from "@/lib/server/log";

/**
 * Daily digest of payment items that still need a human look (S2-16, D17): one e-mail to ADMIN_ALERT_EMAIL, only when there
 * is something to report. Vercel Cron, see vercel.json; authorised with CRON_SECRET like the other cron routes.
 */
export async function GET(req: NextRequest) {
  const log = requestLogger(req, "cron.review-digest");
  const ok = cronAuthorised(req);
  if (ok === null) {
    log.error("CRON_SECRET is not set: refusing to run");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await sendReviewDigest(getAdminDb(), log);
    log.info("review digest finished", { result });
    return NextResponse.json({ result });
  } catch (err) {
    log.error("review digest failed", { err });
    return NextResponse.json({ error: "Digest failed" }, { status: 500 });
  }
}
