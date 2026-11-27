import { NextRequest, NextResponse } from "next/server";
import { parseJson } from "@/lib/server/http";
import { GalleryBody } from "@/lib/shared/schemas/galleries";
import { requireAdmin } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { hashPassword } from "@/lib/gallery/password";
import { planUpdate } from "@/lib/gallery/visibility";
import { sealPassword, forOwner } from "@/lib/gallery/password-vault";
import { extractFolderId } from "@/lib/drive/url-parser";
import { galleriesCol } from "@/lib/server/repos/collections";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const uid = admin.user.uid;

  const { id } = await params;
  const parsedBody = await parseJson(req, GalleryBody);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const { name, driveUrl } = body as { name?: string; driveUrl?: string };

  const update: Record<string, unknown> = { updatedAt: Date.now() };
  if (name) update.name = name;
  if (driveUrl) {
    const folderId = extractFolderId(driveUrl);
    if (!folderId) return NextResponse.json({ error: "Invalid Drive URL" }, { status: 400 });
    update.folderId = folderId;
  }
  // Same public/private rules as the owner (D18): private needs a password, public has none.
  if (body.visibility !== undefined || body.password !== undefined || body.removePassword !== undefined) {
    const current = await galleriesCol().doc(id).get();
    if (!current.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const plan = planUpdate(current.data() ?? {}, {
      visibility: body.visibility, password: body.password, removePassword: body.removePassword,
    });
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 });
    update.visibility = plan.visibility;
    if (plan.newPassword) {
      update.passwordHash = await hashPassword(plan.newPassword);
      update.passwordEnc = sealPassword(plan.newPassword);
      update.password = null; // clear any legacy plaintext copy
      update.pwChangedAt = Date.now();
    } else if (plan.clearPassword) {
      update.passwordHash = null;
      update.passwordEnc = null;
      update.password = null;
      update.pwChangedAt = Date.now();
    }
  }

  const normUrl = (u: unknown): string | null => {
    if (typeof u !== "string") return null;
    const t = u.trim();
    if (!t) return null;
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
  };
  for (const key of ["website", "instagram", "facebook"] as const) {
    if (key in body) update[key] = normUrl(body[key]);
  }

  const beforeDoc = await galleriesCol().doc(id).get();
  await galleriesCol().doc(id).update(update);
  const doc = await galleriesCol().doc(id).get();
  await writeAudit({ actorUid: uid, action: "gallery.update", targetType: "gallery", targetId: id, before: beforeDoc.data(), after: doc.data() });
  return NextResponse.json(forOwner({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const uid = admin.user.uid;

  const { id } = await params;
  const beforeDoc = await galleriesCol().doc(id).get();
  await galleriesCol().doc(id).delete();
  await writeAudit({ actorUid: uid, action: "gallery.delete", targetType: "gallery", targetId: id, before: beforeDoc.data() });
  return NextResponse.json({ ok: true });
}
