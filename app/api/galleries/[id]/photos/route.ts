import { route } from "@/lib/server/http";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { fetchDriveFolder } from "@/lib/drive/client";
import { galleriesCol } from "@/lib/server/repos/collections";

// Owner-auth-gated endpoint that returns the gallery's image list, used by the
// dashboard cover picker. Public galleries never call this — the public page
// already receives `photos` from fetchDriveFolder at render time. We strip the
// response to only what the picker needs (id, name, thumbnailLink) so no folder
// metadata leaks beyond the owner.

async function getGalleryForOwner(id: string, uid: string) {
  const ref = galleriesCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.photographerId !== uid) return null;
  return { ref, data: { id: snap.id, folderId: data.folderId as string } };
}

export const GET = route("galleries.photos.get", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const uid = auth.user.uid;

  const gallery = await getGalleryForOwner(id, uid);
  if (!gallery) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const { files } = await fetchDriveFolder(gallery.data.folderId);
    const photos = files
      .filter((f) => f.mimeType.startsWith("image/"))
      .map((p) => ({
        id: p.id,
        name: p.name,
        thumbnailLink: p.thumbnailLink ?? null,
        // Pixel size (when Drive reports it) lets the cover picker warn about
        // photos too small or too tall for a sharp banner.
        width: p.width ?? null,
        height: p.height ?? null,
      }));
    return NextResponse.json({ photos });
  } catch {
    return NextResponse.json({ error: "Failed to load photos" }, { status: 502 });
  }
});
