import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron calls `/api/cron/*` with `Authorization: Bearer $CRON_SECRET`.
 * Returns null when CRON_SECRET is not configured (fail closed: the caller must refuse to run), otherwise whether the
 * header matches (timing-safe).
 */
export function cronAuthorised(req: Request): boolean | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return null;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
