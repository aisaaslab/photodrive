import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { extractFolderId } from "@/lib/drive/url-parser";
import { clientIp, getRateLimiter, rateLimitHeaders } from "@/lib/server/rate-limit";
import { DEMO_GRACE_MS, DEMO_LIFETIME_MS } from "@/lib/server/cleanup";
import { parseJson } from "@/lib/server/http";
import { DemoCreateBody } from "@/lib/shared/schemas/public";

/**
 * Creates a 10-minute demo gallery from a Drive folder, for visitors without an account.
 *
 * Limits (S3-07, SEC-2), counted in the shared limiter: 3 demos per visitor per 24 hours (the old rule counted every demo
 * ever created, so a visitor was blocked for good after three), and a broad cap on attempts so invalid requests cannot be
 * hammered. The visitor's IP is no longer stored on the demo document.
 */
export async function POST(req: NextRequest) {
  const limiter = getRateLimiter();
  const ip = clientIp(req);

  const attempts = await limiter.limit({ name: "demo-attempts", id: ip, limit: 30, windowSec: 10 * 60 });
  if (!attempts.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(attempts) });
  }

  const body = await parseJson(req, DemoCreateBody);
  if (!body.ok) return body.response;

  const folderId = extractFolderId(body.data.driveUrl);
  if (!folderId) {
    return NextResponse.json({ error: "Invalid Google Drive folder URL" }, { status: 400 });
  }

  // Only a valid request uses up one of the three.
  const demos = await limiter.limit({ name: "demo-create", id: ip, limit: 3, windowSec: 24 * 60 * 60 });
  if (!demos.allowed) {
    return NextResponse.json({ error: "Demo limit reached" }, { status: 429, headers: rateLimitHeaders(demos) });
  }

  const now = Date.now();
  const expiresAt = now + DEMO_LIFETIME_MS;
  const ref = await getAdminDb().collection("demo_galleries").add({
    folderId,
    createdAt: now,
    expiresAt,
    // A real Timestamp, because Firestore's TTL policy only works on Timestamp fields.
    // Kept for a day after expiry (DEMO_GRACE_MS) so the page can say "expired" instead of 404.
    expiresAtTs: Timestamp.fromMillis(expiresAt + DEMO_GRACE_MS),
  });

  return NextResponse.json({ id: ref.id }, { status: 201 });
}
