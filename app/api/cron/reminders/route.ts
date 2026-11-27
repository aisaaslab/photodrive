import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { cronAuthorised } from "@/lib/server/cron-auth";
import { requestLogger } from "@/lib/server/log";
import { reminderMode, runReminders, type ReminderMode } from "@/lib/server/reminders";

// A run sends at most a couple of hundred e-mails; allow headroom for a slow mail server.
export const maxDuration = 300;

/**
 * Daily renewal reminders (S9-03). Vercel Cron, see vercel.json; authorised with CRON_SECRET like the other cron routes.
 *
 * REMINDERS_MODE decides what a run does: `off` (default: nothing), `dry-run` (reports who would be e-mailed what, with masked
 * addresses, and sends and records nothing), `send`. `?mode=dry-run` on the URL can lower any mode to a dry run (so an operator can
 * preview a day's list at any time), but nothing on the URL can turn sending on.
 */
export async function GET(req: NextRequest) {
  const log = requestLogger(req, "cron.reminders");
  const ok = cronAuthorised(req);
  if (ok === null) {
    log.error("CRON_SECRET is not set: refusing to run");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let mode: ReminderMode = reminderMode();
  if (mode !== "off" && req.nextUrl.searchParams.get("mode") === "dry-run") mode = "dry-run";
  if (mode === "off") return NextResponse.json({ skipped: "REMINDERS_MODE is off" });

  try {
    const run = await runReminders({ db: getAdminDb(), mode, log });
    log.info("reminders finished", { mode: run.mode, scanned: run.scanned, due: run.due, sent: run.sent, failed: run.failed, deferred: run.deferred });
    // In a dry run the planned list (uid, kind, language, masked address) goes to the log too, for review.
    if (mode === "dry-run") for (const p of run.planned) log.info("reminder would be sent", { ...p });
    return NextResponse.json(run);
  } catch (err) {
    log.error("reminders failed", { err });
    return NextResponse.json({ error: "Reminders failed" }, { status: 500 });
  }
}
