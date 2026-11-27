import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { clientIp, getRateLimiter, rateLimitHeaders } from "@/lib/server/rate-limit";
import { extractFolderId } from "@/lib/drive/url-parser";
import { checkDriveFolder } from "@/lib/drive/check";

const Body = z.object({ driveUrl: z.string().min(1).max(500) });

/**
 * POST /api/drive/check (S10-03): is this Drive folder usable as a gallery? For signed-in users only, and rate limited, because every
 * call spends the app's Drive quota. Always answers 200 with a `status` the form turns into a message; only a malformed request or a
 * rate limit is an error.
 */
export const POST = route("drive.check", async (req: NextRequest) => {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const limit = await getRateLimiter().limit({ name: "drive-check", id: `${auth.user.uid}|${clientIp(req)}`, limit: 30, windowSec: 60 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(limit) });

  const body = await parseJson(req, Body);
  if (!body.ok) return body.response;
  const folderId = extractFolderId(body.data.driveUrl);
  if (!folderId) return NextResponse.json({ status: "invalid" });

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) return NextResponse.json({ status: "unavailable" });
  return NextResponse.json(await checkDriveFolder(folderId, apiKey), { headers: { "Cache-Control": "private, no-store" } });
});
