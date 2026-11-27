import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { parseJson, route } from "@/lib/server/http";
import { LANGUAGES } from "@/lib/i18n/languages";
import { getRateLimiter, rateLimitHeaders } from "@/lib/server/rate-limit";
import { usersCol } from "@/lib/server/repos/collections";

const Body = z.object({ language: z.enum(LANGUAGES) });

/**
 * Stores the signed-in user's preferred language on their account (S2-13), so messages the server sends them
 * (payment e-mails, reminders) can be written in it. The browser keeps it in localStorage for the UI.
 */
export const PUT = route("user.language.put", async (req: NextRequest) => {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const uid = auth.user.uid;

  const limit = await getRateLimiter().limit({ name: "user-language", id: uid, limit: 20, windowSec: 60 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(limit) });

  const parsed = await parseJson(req, Body, { message: "Invalid language" });
  if (!parsed.ok) return parsed.response;

  try {
    // update(), not set(): never create a half-empty profile for an account that has no user document yet.
    await usersCol().doc(uid).update({ language: parsed.data.language, languageUpdatedAt: Date.now() });
  } catch (err) {
    if ((err as { code?: number | string }).code === 5) return NextResponse.json({ error: "Profile not ready" }, { status: 409 });
    throw err;
  }
  return NextResponse.json({ ok: true, language: parsed.data.language });
});
