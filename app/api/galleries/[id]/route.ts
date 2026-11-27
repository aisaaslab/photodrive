import { NextRequest, NextResponse } from "next/server";
import { parseExpiryInput } from "@/lib/gallery/availability";
import { parseJson, route } from "@/lib/server/http";
import { deleteGalleryCascade } from "@/lib/server/repos/galleries";
import { GalleryBody } from "@/lib/shared/schemas/galleries";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/server/auth";
import { hashPassword } from "@/lib/gallery/password";
import { planUpdate } from "@/lib/gallery/visibility";
import { sealPassword, forOwner } from "@/lib/gallery/password-vault";
import { extractFolderId } from "@/lib/drive/url-parser";
import { validTitleFont, validTitleColor, validTitleSize } from "@/lib/gallery/title-style";
import { validCoverPos } from "@/lib/gallery/cover-position";
import { galleriesCol } from "@/lib/server/repos/collections";

async function getGalleryForOwner(id: string, uid: string) {
  const ref = galleriesCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.photographerId !== uid) return null;
  return { ref, data: { id: snap.id, ...data } };
}

export const PATCH = route("galleries.item.patch", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const uid = auth.user.uid;

  const gallery = await getGalleryForOwner(id, uid);
  if (!gallery) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsedBody = await parseJson(req, GalleryBody);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
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
  // S9-05: the gallery's own expiry date ("YYYY-MM-DD", or empty/null to clear). Extending it brings the gallery back at once.
  if (body.expiresAt !== undefined) {
    const exp = parseExpiryInput(body.expiresAt);
    if (!exp.ok) return NextResponse.json({ error: "Invalid expiry date" }, { status: 400 });
    updates.expiresAt = exp.value;
  }
  // S9-06. Changing the option starts afresh: the stamp of an earlier submission is cleared, so turning it on later does not lock
  // retroactively and turning it off gives downloads back. Saving with the option unchanged (the dialog sends every field) must NOT
  // clear it, or any save would re-open downloads after a client sent their selection.
  if (typeof body.disableDownloadAfterSubmit === "boolean" && body.disableDownloadAfterSubmit !== ((gallery.data as { disableDownloadAfterSubmit?: boolean }).disableDownloadAfterSubmit === true)) {
    updates.disableDownloadAfterSubmit = body.disableDownloadAfterSubmit;
    updates.downloadsLockedAt = null;
  }

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
});

export const DELETE = route("galleries.item.delete", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const uid = auth.user.uid;

  const gallery = await getGalleryForOwner(id, uid);
  if (!gallery) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The gallery and its client favourites / submission go together.
  await deleteGalleryCascade(getAdminDb(), id);
  return NextResponse.json({ ok: true });
});
