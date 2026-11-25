import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { hashPassword } from "@/lib/gallery/password";
import { planUpdate } from "@/lib/gallery/visibility";
import { sealPassword, forOwner } from "@/lib/gallery/password-vault";
import { extractFolderId } from "@/lib/drive/url-parser";
import { validTitleFont, validTitleColor, validTitleSize } from "@/lib/gallery/title-style";
import { validCoverPos } from "@/lib/gallery/cover-position";

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

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const updates: Record<string, unknown> = { updatedAt: Date.now() };

  if (body.name) updates.name = body.name;
  if (body.driveUrl) {
    const folderId = extractFolderId(String(body.driveUrl));
    if (!folderId) return NextResponse.json({ error: "Invalid Drive URL" }, { status: 400 });
    updates.folderId = folderId;
  }
  // Public or private (D18). A private gallery always keeps a password; switching to public removes it.
  // Only touch visibility/password when the request actually says something about them.
  if (body.visibility !== undefined || body.password !== undefined || body.removePassword !== undefined) {
    const plan = planUpdate(gallery.data as Record<string, unknown>, {
      visibility: body.visibility, password: body.password, removePassword: body.removePassword,
    });
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 });
    updates.visibility = plan.visibility;
    if (plan.newPassword) {
      updates.passwordHash = await hashPassword(plan.newPassword);
      updates.passwordEnc = sealPassword(plan.newPassword);
      updates.password = null; // clear any legacy plaintext copy
      updates.pwChangedAt = Date.now();
    } else if (plan.clearPassword) {
      updates.passwordHash = null;
      updates.passwordEnc = null;
      updates.password = null;
      updates.pwChangedAt = Date.now();
    }
  }
  if (typeof body.allowDownload === "boolean") updates.allowDownload = body.allowDownload;

  // Optional gallery metadata. Each is stored as null when cleared (empty
  // string / invalid date), so the field disappears from the public render.
  if (typeof body.description === "string")
    updates.description = body.description.trim() || null;
  if (typeof body.eventDate === "string")
    updates.eventDate = /^\d{4}-\d{2}-\d{2}$/.test(body.eventDate) ? body.eventDate : null;
  if (typeof body.location === "string")
    updates.location = body.location.trim() || null;
  // coverFileId: a Drive file id string, or null to clear the cover.
  if (body.coverFileId !== undefined)
    updates.coverFileId = typeof body.coverFileId === "string" ? body.coverFileId : null;
  // Cover focal point (percent, 0–100). Clamped on write; non-numbers clear it.
  if (body.coverPosX !== undefined) updates.coverPosX = validCoverPos(body.coverPosX);
  if (body.coverPosY !== undefined) updates.coverPosY = validCoverPos(body.coverPosY);
  // "Book this photographer" CTA: a URL (mailto:, https://wa.me/, etc.) and a
  // toggle. When bookEnabled is false, the CTA is hidden on the public page.
  if (typeof body.bookLink === "string")
    updates.bookLink = body.bookLink.trim() || null;
  if (typeof body.bookEnabled === "boolean") updates.bookEnabled = body.bookEnabled;
  // Header branding: only "photographer" is a valid non-default value.
  if (body.headerBranding !== undefined)
    updates.headerBranding = body.headerBranding === "photographer" ? "photographer" : null;
  // Title styling: validated against the curated sets in lib/gallery/title-style.ts.
  // Unknown ids / malformed colors are dropped to null (back to defaults).
  if (body.titleFont !== undefined)
    updates.titleFont = validTitleFont(body.titleFont);
  if (body.titleColor !== undefined)
    updates.titleColor = validTitleColor(body.titleColor);
  if (body.titleSize !== undefined)
    updates.titleSize = validTitleSize(body.titleSize);

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
  return NextResponse.json(forOwner({ ...gallery.data, ...updates }));
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
