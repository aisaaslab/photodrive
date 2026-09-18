import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getUidFromRequest, isAdmin } from "@/lib/firebase/admin-guard";
import {
  SITE_SETTINGS_DOC,
  getSiteSettings,
  validateSupportEmail,
} from "@/lib/site-settings";

/** GET: current site settings (support email + last update info). */
export async function GET(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getSiteSettings(uid));
}

/** PATCH: update the support email (stored in Firestore, takes effect immediately). */
export async function PATCH(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let supportEmail: string;
  try {
    supportEmail = validateSupportEmail(body.supportEmail);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  await getAdminDb().doc(SITE_SETTINGS_DOC).set(
    { supportEmail, updatedAt: Date.now(), updatedBy: uid },
    { merge: true }
  );
  return NextResponse.json({ supportEmail });
}
