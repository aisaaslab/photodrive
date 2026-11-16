import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getUidFromRequest, isAdmin } from "@/lib/firebase/admin-guard";
import { hashPassword } from "@/lib/gallery/password";
import { sealPassword, forOwner } from "@/lib/gallery/password-vault";
import { extractFolderId } from "@/lib/drive/url-parser";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { name, driveUrl, password, removePassword } = body;

  const update: Record<string, unknown> = { updatedAt: Date.now() };
  if (name) update.name = name;
  if (driveUrl) {
    const folderId = extractFolderId(driveUrl);
    if (!folderId) return NextResponse.json({ error: "Invalid Drive URL" }, { status: 400 });
    update.folderId = folderId;
  }
  if (removePassword) {
    update.passwordHash = null;
    update.passwordEnc = null;
    update.password = null;
    update.pwChangedAt = Date.now();
  } else if (password) {
    update.passwordHash = await hashPassword(password);
    update.passwordEnc = sealPassword(String(password));
    update.password = null; // clear any legacy plaintext copy
    update.pwChangedAt = Date.now();
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
