import { NextRequest, NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/gallery/password";
import { signGalleryToken } from "@/lib/gallery/session";
import { clientIp, getRateLimiter, rateLimitHeaders } from "@/lib/server/rate-limit";
import { requestLogger } from "@/lib/server/log";
import { parseJson } from "@/lib/server/http";
import { VerifyPasswordBody } from "@/lib/shared/schemas/public";
import { galleriesCol } from "@/lib/server/repos/collections";

// Verified against when the gallery does not exist or has no password, so every outcome costs one real bcrypt
// compare and the response time does not reveal which galleries exist. Created once, on first use.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-gallery-password"));

const WRONG = () => NextResponse.json({ error: "Incorrect password" }, { status: 401 });
const LOCKED = (retryAfterSec: number) =>
  NextResponse.json(
    { error: "Too many attempts. Try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );

/**
 * Unlocks a private gallery. Hardened (S3-05, SEC-2/SEC-3):
 * - the body is validated (bad JSON or fields give 400, never a 500);
 * - 5 wrong passwords within 10 minutes for the same visitor (IP) and gallery lock that pair for 15 minutes;
 * - a broad per-IP limit stops one visitor from trying many galleries;
 * - a missing gallery, a gallery without a password and a wrong password all answer the same 401;
 * - the access cookie is `Secure` in production.
 */
export async function POST(req: NextRequest) {
  const log = requestLogger(req, "gallery.verify-password");

  const body = await parseJson(req, VerifyPasswordBody);
  if (!body.ok) return body.response;
  const { slug, password } = body.data;

  const limiter = getRateLimiter();
  const ip = clientIp(req);

  const broad = await limiter.limit({ name: "verify-pw-ip", id: ip, limit: 30, windowSec: 60 });
  if (!broad.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: rateLimitHeaders(broad) });
  }

  // The lock is per visitor AND gallery, so locking one gallery never locks the visitor out of another.
  const who = { name: "gallery-pw", id: `${ip}|${slug}` };
  const lock = await limiter.isLocked(who);
  if (lock.locked) return LOCKED(lock.retryAfterSec);

  const snap = await galleriesCol().where("slug", "==", slug).limit(1).get();
  const gallery = snap.empty ? null : snap.docs[0];
  const data = gallery?.data();
  // A gallery an administrator has turned off cannot be unlocked either (S7-06).
  if (data?.disabled === true) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const hash = typeof data?.passwordHash === "string" ? data.passwordHash : null;

  const valid = await verifyPassword(password, hash ?? (await getDummyHash()));
  if (!gallery || !hash || !valid) {
    const state = await limiter.recordFailure(who);
    if (state.locked) {
      log.warn("gallery password lockout", { galleryExists: !!gallery });
      return LOCKED(state.retryAfterSec);
    }
    return WRONG();
  }

  await limiter.reset(who);
  const token = await signGalleryToken(gallery.id, (data!.pwChangedAt as number) ?? 0);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(`gallery_token_${gallery.id}`, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return response;
}
