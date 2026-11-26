import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { LANGUAGES } from "@/lib/i18n/languages";
import { getRateLimiter, rateLimitHeaders } from "@/lib/server/rate-limit";

const Body = z.object({ language: z.enum(LANGUAGES) });

/**
 * Stores the signed-in user's preferred language on their account (S2-13), so messages the server sends them
 * (payment e-mails, reminders) can be written in it. The browser keeps it in localStorage for the UI.
 */
export async function PUT(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = await getRateLimiter().limit({ name: "user-language", id: uid, limit: 20, windowSec: 60 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(limit) });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid language" }, { status: 400 });

  try {
    // update(), not set(): never create a half-empty profile for an account that has no user document yet.
    await getAdminDb().collection("users").doc(uid).update({ language: parsed.data.language, languageUpdatedAt: Date.now() });
  } catch (err) {
    if ((err as { code?: number | string }).code === 5) return NextResponse.json({ error: "Profile not ready" }, { status: 409 });
    throw err;
  }
  return NextResponse.json({ ok: true, language: parsed.data.language });
}
