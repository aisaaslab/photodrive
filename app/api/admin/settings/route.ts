import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { revalidateTag } from "next/cache";
import { getAdminAuth } from "@/lib/firebase/admin";
import { route } from "@/lib/server/http";
import { getSiteSettings } from "@/lib/site-settings";
import { SITE_SETTINGS_TAG, readTrackingIds } from "@/lib/tracking-settings";
import { TRACKING_FIELDS, checkSupportEmail, checkTrackingId } from "@/lib/shared/site-rules";
import { siteSettingsDoc } from "@/lib/server/repos/collections";

type Stored = Record<string, unknown>;

/** Who changed the settings last, by e-mail (the stored value is only an account id). Never fails the request. */
async function changedBy(uid: string | null | undefined): Promise<string | null> {
  if (!uid) return null;
  try { return (await getAdminAuth().getUser(uid)).email ?? null; } catch { return null; }
}

async function current(uid: string) {
  const [settings, tracking] = await Promise.all([getSiteSettings(uid), readTrackingIds()]);
  return { ...settings, ...tracking, updatedByEmail: await changedBy(settings.updatedBy) };
}

/** GET: current site settings (support email, tracking IDs, when and by whom they were last changed). */
export const GET = route("admin.settings.get", async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  return NextResponse.json(await current(admin.user.uid));
});

/**
 * PATCH: update any subset of { supportEmail, gtmId, googleAdsId, metaPixelId } (S8-04). Every field is checked with the shared rules the
 * form uses; an invalid one answers 400 with `{ error, fields: { name: message } }` and nothing is saved. Only values that really changed
 * are written and audited; a save that changes nothing answers `changed: false`. An empty tracking ID switches that tag off. Takes effect
 * within seconds, no redeploy.
 */
export const PATCH = route("admin.settings.update", async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const uid = admin.user.uid;

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const wanted: Record<string, string> = {};
  const fields: Record<string, string> = {};
  if ("supportEmail" in body) {
    const r = checkSupportEmail(body.supportEmail);
    if (r.ok) wanted.supportEmail = r.value; else fields.supportEmail = r.error;
  }
  for (const field of TRACKING_FIELDS) {
    if (!(field in body)) continue;
    const r = checkTrackingId(field, body[field]);
    if (r.ok) wanted[field] = r.value; else fields[field] = r.error;
  }
  if (Object.keys(fields).length) return NextResponse.json({ error: Object.values(fields)[0], fields }, { status: 400 });
  if (Object.keys(wanted).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const before = ((await siteSettingsDoc().get()).data() ?? {}) as Stored;
  // What the screen shows when nothing is stored yet is the default, so compare against that, not against "missing".
  const shown = await current(uid);
  const update: Record<string, string> = {};
  for (const [k, v] of Object.entries(wanted)) {
    if (v !== ((shown as Record<string, unknown>)[k] ?? "")) update[k] = v;
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ ...shown, changed: false });

  await siteSettingsDoc().set({ ...update, updatedAt: Date.now(), updatedBy: uid }, { merge: true });
  // Expire immediately (not stale-while-revalidate) so the next page render already carries the new tags.
  revalidateTag(SITE_SETTINGS_TAG, { expire: 0 });
  const pick = (o: Stored) => Object.fromEntries(Object.keys(update).map((k) => [k, o[k] ?? null]));
  await writeAudit({ actorUid: uid, action: "settings.update", targetType: "settings", targetId: "site", before: pick(before), after: pick({ ...before, ...update }) });

  return NextResponse.json({ ...(await current(uid)), changed: true });
});
