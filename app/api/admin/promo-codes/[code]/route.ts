import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getUidFromRequest, isAdmin } from "@/lib/firebase/admin-guard";
import { PROMO_COLLECTION, normalizeCode, validAccessDays, MAX_ACCESS_DAYS } from "@/lib/promo-codes";

/** PATCH: change a rule's length, note or on/off state. Applies to FUTURE redemptions only. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const code = normalizeCode((await params).code);
  const ref = getAdminDb().collection(PROMO_COLLECTION).doc(code);
  if (!code || !(await ref.get()).exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updatedAt: Date.now() };
  if (body.accessDays !== undefined) {
    const days = validAccessDays(body.accessDays);
    if (!days) return NextResponse.json({ error: `Access length must be 1–${MAX_ACCESS_DAYS} days.` }, { status: 400 });
    update.accessDays = days;
  }
  if (typeof body.note === "string") update.note = body.note.trim().slice(0, 200);
  if (typeof body.active === "boolean") update.active = body.active;

  await ref.update(update);
  return NextResponse.json({ ok: true });
}

/** DELETE: remove a rule (codes without a rule fall back to the chosen plan's length). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const code = normalizeCode((await params).code);
  if (!code) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await getAdminDb().collection(PROMO_COLLECTION).doc(code).delete();
  return NextResponse.json({ ok: true });
}
