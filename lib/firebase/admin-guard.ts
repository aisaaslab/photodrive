import "server-only";
import { NextRequest } from "next/server";
import { isAdmin as isAdminUid, verifyBearer } from "@/lib/server/auth";

// Kept for the many callers of these two helpers; the logic lives in lib/server/auth.ts (S5-04). New code uses `requireUser` /
// `requireAdmin` from there.
export async function getUidFromRequest(req: NextRequest): Promise<string | null> {
  return (await verifyBearer(req))?.uid ?? null;
}

export const isAdmin = isAdminUid;
