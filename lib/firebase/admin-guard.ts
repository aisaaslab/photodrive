import { NextRequest } from "next/server";
import { getAdminAuth } from "./admin";

export async function getUidFromRequest(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

export function isAdmin(uid: string | null): boolean {
  const adminUid = process.env.ADMIN_UID;
  if (!adminUid || !uid) return false;
  return uid === adminUid;
}
