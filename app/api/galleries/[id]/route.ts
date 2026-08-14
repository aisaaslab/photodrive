import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { hashPassword } from "@/lib/gallery/password";
import { extractFolderId } from "@/lib/drive/url-parser";

async function getUid(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

async function getGalleryForOwner(id: string, uid: string) {
  const ref = getAdminDb().collection("galleries").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.photographerId !== uid) return null;
  return { ref, data: { id: snap.id, ...data } };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gallery = await getGalleryForOwner(id, uid);
  if (!gallery) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: Date.now() };

  if (body.name) updates.name = body.name;
  if (body.driveUrl) {
    const folderId = extractFolderId(body.driveUrl);
    if (!folderId) return NextResponse.json({ error: "Invalid Drive URL" }, { status: 400 });
    updates.folderId = folderId;
  }
  if (body.password) {
    updates.passwordHash = await hashPassword(body.password);
    updates.password = body.password;
    updates.pwChangedAt = Date.now();
  }
  if (body.removePassword) {
    updates.passwordHash = null;
    updates.password = null;
    updates.pwChangedAt = Date.now();
  }
  if (typeof body.allowDownload === "boolean") updates.allowDownload = body.allowDownload;

  const normUrl = (u: unknown): string | null => {
    if (typeof u !== "string") return null;
    const t = u.trim();
    if (!t) return null;
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
  };
  for (const key of ["website", "instagram", "facebook"] as const) {
    if (key in body) updates[key] = normUrl(body[key]);
  }

  await gallery.ref.update(updates);
  return NextResponse.json({ ...gallery.data, ...updates });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gallery = await getGalleryForOwner(id, uid);
  if (!gallery) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await gallery.ref.delete();
  return NextResponse.json({ ok: true });
}
