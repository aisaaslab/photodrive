import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { galleriesCol } from "@/lib/server/repos/collections";

/**
 * Admin-only: turn a gallery off or back on (S7-06). Body: `{ disabled: boolean, reason?: string }`.
 * A disabled gallery is refused by the public page, the photo and media routes, downloads, favourites and the password check, and the
 * visitor sees a neutral "not available" page. Nothing is deleted: turning it back on restores it exactly. The reason is for the team
 * only (kept on the gallery and in the audit trail), never shown to visitors.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  let body: { disabled?: unknown; reason?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (typeof body.disabled !== "boolean") return NextResponse.json({ error: "Missing disabled" }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";

  const { id } = await params;
  const ref = galleriesCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  const before = { disabled: snap.get("disabled") === true, disabledReason: snap.get("disabledReason") ?? null };
  if (before.disabled === body.disabled) return NextResponse.json({ ok: true, changed: false });

  const now = Date.now();
  if (body.disabled) {
    await ref.update({ disabled: true, disabledAt: now, disabledBy: admin.user.uid, disabledReason: reason || null });
  } else {
    await ref.update({ disabled: false, disabledAt: FieldValue.delete(), disabledBy: FieldValue.delete(), disabledReason: FieldValue.delete() });
  }
  await writeAudit({
    actorUid: admin.user.uid, action: body.disabled ? "gallery.disable" : "gallery.enable", targetType: "gallery", targetId: id,
    before, after: { disabled: body.disabled, disabledReason: body.disabled ? reason || null : null }, ...(reason && { note: reason }),
  });
  return NextResponse.json({ ok: true, changed: true });
}
