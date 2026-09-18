import { NextResponse } from "next/server";
import { getSupportEmail } from "@/lib/site-settings";

/** Public endpoint — returns the current support email without exposing env vars. */
export async function GET() {
  const supportEmail = await getSupportEmail();
  return NextResponse.json(
    { supportEmail },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
  );
}
