import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { parseJson, route } from "@/lib/server/http";
import { promoCodesCol } from "@/lib/server/repos/collections";
import { normalizeCode } from "@/lib/shared/promo";
import { PromoUpdateBody } from "@/lib/shared/schemas/promo";

/** PATCH: change a rule's length, note or on/off state. Applies to FUTURE redemptions only. Asking for what is already true records nothing. */
export const PATCH = route("admin.promo.patch", async (req: NextRequest, { params }: { params: Promise<{ code: string }> }) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  const code = normalizeCode((await params).code);
  const ref = promoCodesCol().doc(code || "-");
  const snap = code ? await ref.get() : null;
  if (!snap?.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await parseJson(req, PromoUpdateBody, { message: "Please check the code's details." });
  if (!body.ok) return body.response;

  const before = snap.data()!;
  const changes: Record<string, unknown> = {};
  if (body.data.accessDays !== undefined && body.data.accessDays !== before.accessDays) changes.accessDays = body.data.accessDays;
  if (body.data.note !== undefined && body.data.note !== (before.note ?? "")) changes.note = body.data.note;
  if (body.data.active !== undefined && body.data.active !== (before.active !== false)) changes.active = body.data.active;
  if (Object.keys(changes).length === 0) return NextResponse.json({ ok: true, changed: false });

  const update = { ...changes, updatedAt: Date.now() };
  await ref.update(update);
  await writeAudit({ actorUid: admin.user.uid, action: "promo.update", targetType: "promoCode", targetId: code, before, after: { ...before, ...update } });
  return NextResponse.json({ ok: true, changed: true });
});

/** DELETE: remove a rule (codes without a rule fall back to the chosen plan's length). */
export const DELETE = route("admin.promo.delete", async (req: NextRequest, { params }: { params: Promise<{ code: string }> }) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  const code = normalizeCode((await params).code);
  const snap = code ? await promoCodesCol().doc(code).get() : null;
  if (!snap?.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await snap.ref.delete();
  await writeAudit({ actorUid: admin.user.uid, action: "promo.delete", targetType: "promoCode", targetId: code, before: snap.data() });
  return NextResponse.json({ ok: true });
});
