import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { billingFulfilV2 } from "@/lib/server/billing/flags";
import { reconcilePayments } from "@/lib/server/billing/reconcile";
import { getStripe, StripeConfigError } from "@/lib/server/billing/stripe";
import { requestLogger } from "@/lib/server/log";

// Listing and fulfilling a day or two of sessions is quick, but allow headroom on slow Stripe calls.
export const maxDuration = 60;

function authorised(req: NextRequest): boolean | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return null; // not configured: fail closed
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Hourly reconciliation (Vercel Cron, see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`
 * when the CRON_SECRET environment variable is set; anything else is refused.
 */
export async function GET(req: NextRequest) {
  const log = requestLogger(req, "cron.reconcile-payments");

  const ok = authorised(req);
  if (ok === null) {
    log.error("CRON_SECRET is not set: refusing to run");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Until the new payment path is on, the old path owns fulfilment; do not run beside it.
  if (!billingFulfilV2()) return NextResponse.json({ skipped: "BILLING_FULFIL_V2 is off" });

  try {
    const summary = await reconcilePayments({ db: getAdminDb(), stripe: getStripe(), log });
    log.info("reconcile finished", { ...summary });
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof StripeConfigError) {
      log.error(err.message);
      return NextResponse.json({ error: "Payments are not configured" }, { status: 500 });
    }
    log.error("reconcile failed", { err });
    return NextResponse.json({ error: "Reconcile failed" }, { status: 500 });
  }
}
