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
 * `requireAdmin` additionally answers 403 for a signed-in user who is not the administrator.
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

export function isAdmin(uid: string | null | undefined): boolean {
  const adminUid = process.env.ADMIN_UID;
  return !!adminUid && !!uid && uid === adminUid;
}

export async function requireUser(req: Request): Promise<AuthResult> {
  const user = await verifyBearer(req);
  return user ? { ok: true, user } : { ok: false, response: unauthorized() };
}

export async function requireAdmin(req: Request): Promise<AuthResult> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth;
  return isAdmin(auth.user.uid) ? auth : { ok: false, response: forbidden() };
}
