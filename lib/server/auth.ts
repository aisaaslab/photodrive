import "server-only";
import { NextResponse } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth } from "@/lib/firebase/admin";

/**
 * The one place that turns an `Authorization: Bearer <Firebase ID token>` header into a signed-in user (S5-04, STR-2). Before this,
 * nine route files carried their own copy of the same lines.
 *
 *   const auth = await requireUser(req);
 *   if (!auth.ok) return auth.response;     // 401 { error: "Unauthorized" }
 *   const { uid, email } = auth.user;
 *
 * `requireAdmin` additionally answers 403 for a signed-in user who is not an administrator. An administrator is the bootstrap account
 * named by `ADMIN_UID`, or any user carrying the `admin` custom claim (S7-02: more than one admin; granted and revoked with
 * `scripts/admin/set-admin-claim.ts`). A claim is only honoured while it has not been revoked: `requireAdmin` re-checks the token
 * against Firebase Auth's revocation list, so revoking an admin takes effect at once, not when their one-hour token expires.
 */

export type SignedIn = DecodedIdToken;
export type AuthResult = { ok: true; user: SignedIn } | { ok: false; response: NextResponse };

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

/** The verified user, or null when there is no valid token. Never throws. For routes where signing in is optional. */
export async function verifyBearer(req: Request): Promise<SignedIn | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return null;
  try {
    return await getAdminAuth().verifyIdToken(token);
  } catch {
    return null;
  }
}

/** The bootstrap administrator named by `ADMIN_UID`. Prefer `isAdminToken`, which also knows the `admin` claim. */
export function isAdmin(uid: string | null | undefined): boolean {
  const adminUid = process.env.ADMIN_UID;
  return !!adminUid && !!uid && uid === adminUid;
}

/** Administrator by bootstrap id or by the `admin` custom claim on a verified token (revocation is checked by `requireAdmin`). */
export function isAdminToken(user: { uid: string; admin?: unknown }): boolean {
  return user.admin === true || isAdmin(user.uid);
}

const bearerToken = (req: Request) => /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];

export async function requireUser(req: Request): Promise<AuthResult> {
  const user = await verifyBearer(req);
  return user ? { ok: true, user } : { ok: false, response: unauthorized() };
}

export async function requireAdmin(req: Request): Promise<AuthResult> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth;
  if (isAdmin(auth.user.uid)) return auth;
  if (auth.user.admin !== true) return { ok: false, response: forbidden() };
  // A granted admin: make sure the grant has not been revoked since this token was issued.
  try {
    await getAdminAuth().verifyIdToken(bearerToken(req) ?? "", true);
    return auth;
  } catch {
    return { ok: false, response: forbidden() };
  }
}
