import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getUidFromRequest, isAdmin } from "@/lib/firebase/admin-guard";
import { hashPassword } from "@/lib/gallery/password";
import { planUpdate } from "@/lib/gallery/visibility";
import { sealPassword, forOwner } from "@/lib/gallery/password-vault";
import { extractFolderId } from "@/lib/drive/url-parser";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
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
    const current = await getAdminDb().collection("galleries").doc(id).get();
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

  await getAdminDb().collection("galleries").doc(id).update(update);
  const doc = await getAdminDb().collection("galleries").doc(id).get();
  return NextResponse.json(forOwner({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await getAdminDb().collection("galleries").doc(id).delete();
  return NextResponse.json({ ok: true });
}
