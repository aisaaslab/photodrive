import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { normalizeCode, validAccessDays, MAX_ACCESS_DAYS } from "@/lib/promo-codes";
import { promoCodesCol } from "@/lib/server/repos/collections";

/** PATCH: change a rule's length, note or on/off state. Applies to FUTURE redemptions only. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const uid = admin.user.uid;

  const code = normalizeCode((await params).code);
  const ref = promoCodesCol().doc(code);
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

  const beforeDoc = (await ref.get()).data();
  await ref.update(update);
  await writeAudit({ actorUid: uid, action: "promo.update", targetType: "promoCode", targetId: code, before: beforeDoc, after: { ...beforeDoc, ...update } });
  return NextResponse.json({ ok: true });
}

/** DELETE: remove a rule (codes without a rule fall back to the chosen plan's length). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const uid = admin.user.uid;

  const code = normalizeCode((await params).code);
  if (!code) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const beforeDoc = (await promoCodesCol().doc(code).get()).data();
  await promoCodesCol().doc(code).delete();
  await writeAudit({ actorUid: uid, action: "promo.delete", targetType: "promoCode", targetId: code, before: beforeDoc });
  return NextResponse.json({ ok: true });
}
