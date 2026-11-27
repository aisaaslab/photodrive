import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { route } from "@/lib/server/http";

/**
 * Staging check for error monitoring (S0-06): raises a deliberate error so you can see it arrive in Sentry with its release and
 * environment. Administrators only, and only when `SENTRY_TEST_ROUTE=1` is set on a server that is not production (`APP_ENV` other than
 * "production"); anywhere else it answers 404 as if it did not exist. Nothing is written.
 */
export const GET = route("admin.sentry-test", async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  if (process.env.SENTRY_TEST_ROUTE !== "1" || process.env.APP_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  throw new Error("Sentry test error from /api/admin/sentry-test (S0-06): this is deliberate");
});
