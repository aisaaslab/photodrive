import { NextRequest, NextResponse } from "next/server";
import { parseJson, route } from "@/lib/server/http";
import { SelectionToggleBody } from "@/lib/shared/schemas/public";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyBearer } from "@/lib/server/auth";
import { galleryFiles, hasGalleryAccess, isOwnerOrAdmin, loadProxyGallery, type ProxyGallery } from "@/lib/server/photo-access";
import { photoToken } from "@/lib/server/media-token";
import { usesProtectedTier } from "@/lib/server/protected-photos";
import { galleriesCol, gallerySelectionsCol } from "@/lib/server/repos/collections";


type Item = { id: string; name: string };

/**
 * Who may read and change the favourites of a gallery (S3-03). A private gallery's visitors must have unlocked it (before, anyone
 * who knew a gallery id could read and edit its favourites, and read the Drive file ids in them); the owner and administrators
 * always may. In the protected tier, visitors see and send opaque photo tokens; the stored favourites always hold real file ids
 * (the owner's dashboard needs them), and the translation happens here.
 */
type Access =
  | { error: NextResponse; gallery?: undefined; tokens?: undefined }
  | { error?: undefined; gallery: ProxyGallery; owner: boolean; tokens: boolean };

async function selectionAccess(req: NextRequest, id: string): Promise<Access> {
  const gallery = await loadProxyGallery(id);
  if (!gallery || gallery.disabled) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const owner = await isOwnerOrAdmin(req, gallery);
  if (!owner && gallery.private && !(await hasGalleryAccess(req.cookies.get(`gallery_token_${id}`)?.value, gallery))) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { gallery, owner, tokens: !owner && usesProtectedTier(gallery) };
}

/**
 * Shared favourites for a gallery. There is ONE selection per gallery, so
 * anyone who opens the gallery link sees the same favourited photos, and the
 * photographer sees them too. No account needed.
 */

// Public: return the gallery's shared favourites. When the caller is the
// gallery's owner (Bearer token), the client's submission — name, email, note —
// is included too; it is never exposed to the public.
export const GET = route("galleries.selection.get", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const access = await selectionAccess(req, id);
  if (access.error) return access.error;
  const db = getAdminDb();
  const snap = await gallerySelectionsCol(db).doc(id).get();
  let items: Item[] = snap.exists ? (snap.data()?.items ?? []) : [];
  items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (access.tokens) items = items.map((i) => ({ id: photoToken(id, i.id), name: i.name }));

  let submission: unknown = undefined;
  // The client's name, e-mail and note are for the gallery's owner only; anyone else (or an invalid token) is a public request.
  if (snap.exists && snap.data()?.submission) {
    const uid = (await verifyBearer(req))?.uid;
    if (uid) {
      const gal = await galleriesCol(db).doc(id).get();
      if (gal.exists && gal.data()?.photographerId === uid) submission = snap.data()!.submission;
    }
  }
  return NextResponse.json({ photos: items, ...(submission ? { submission } : {}) });
});

// Public: add or remove one photo from the shared favourites.
export const POST = route("galleries.selection.post", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;

  const body = await parseJson(req, SelectionToggleBody);
  if (!body.ok) return body.response;
  const { action, item } = body.data;

  const access = await selectionAccess(req, id);
  if (access.error) return access.error;

  // Protected tier: the visitor sends a token; store the real file id it stands for. A token that is not in the gallery's folder is refused.
  let fileId = item.id;
  if (access.tokens) {
    const match = (await galleryFiles(access.gallery.folderId)).find((f) => photoToken(id, f.id) === item.id);
    if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });
    fileId = match.id;
  }

  const db = getAdminDb();
  const ref = gallerySelectionsCol(db).doc(id);
  const snap = await ref.get();
  let items: Item[] = snap.exists ? (snap.data()?.items ?? []) : [];

  if (action === "add") {
    if (!items.some((i) => i.id === fileId)) {
      items.push({ id: fileId, name: String(item.name ?? "").slice(0, 300) });
    }
  } else {
    items = items.filter((i) => i.id !== fileId);
  }

  // merge: keep the client's submission (stored on the same doc) intact.
  await ref.set({ galleryId: id, items, count: items.length, updatedAt: Date.now() }, { merge: true });
  return NextResponse.json({ ok: true, count: items.length });
});
