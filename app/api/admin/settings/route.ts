import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { revalidateTag } from "next/cache";
import {
  getSiteSettings,
  validateSupportEmail,
} from "@/lib/site-settings";
import {
  SITE_SETTINGS_TAG,
  readTrackingIds,
  validateTrackingId,
  type TrackingField,
} from "@/lib/tracking-settings";
import { siteSettingsDoc } from "@/lib/server/repos/collections";

const TRACKING_FIELDS: TrackingField[] = ["gtmId", "googleAdsId", "metaPixelId"];

/** GET: current site settings (support email, tracking IDs, last update info). */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const uid = admin.user.uid;
  const [settings, tracking] = await Promise.all([getSiteSettings(uid), readTrackingIds()]);
  return NextResponse.json({ ...settings, ...tracking });
}

/**
 * PATCH: update any subset of { supportEmail, gtmId, googleAdsId, metaPixelId }.
 * Stored in Firestore; takes effect within seconds, no redeploy. An empty
 * tracking ID disables that tag.
 */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const uid = admin.user.uid;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  try {
    if ("supportEmail" in body) update.supportEmail = validateSupportEmail(body.supportEmail);
    for (const field of TRACKING_FIELDS) {
      if (field in body) update[field] = validateTrackingId(field, body[field]);
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const beforeSettings = (await siteSettingsDoc().get()).data() ?? {};
  await siteSettingsDoc().set(
    { ...update, updatedAt: Date.now(), updatedBy: uid },
    { merge: true }
  );
  // Expire immediately (not stale-while-revalidate) so the next page render
  // already carries the new tags.
  revalidateTag(SITE_SETTINGS_TAG, { expire: 0 });
  await writeAudit({ actorUid: uid, action: "settings.update", targetType: "settings", targetId: "site", before: beforeSettings, after: { ...beforeSettings, ...update } });

  const [settings, tracking] = await Promise.all([getSiteSettings(uid), readTrackingIds()]);
  return NextResponse.json({ ...settings, ...tracking });
}
