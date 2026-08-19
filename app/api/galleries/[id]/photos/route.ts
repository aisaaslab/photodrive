import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { fetchDriveFolder } from "@/lib/drive/client";

// Owner-auth-gated endpoint that returns the gallery's image list, used by the
// dashboard cover picker. Public galleries never call this — the public page
// already receives `photos` from fetchDriveFolder at render time. We strip the
// response to only what the picker needs (id, name, thumbnailLink) so no folder
// metadata leaks beyond the owner.

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
  return { ref, data: { id: snap.id, folderId: data.folderId as string } };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gallery = await getGalleryForOwner(id, uid);
  if (!gallery) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const { files } = await fetchDriveFolder(gallery.data.folderId);
    const photos = files
      .filter((f) => f.mimeType.startsWith("image/"))
      .map((p) => ({ id: p.id, name: p.name, thumbnailLink: p.thumbnailLink ?? null }));
    return NextResponse.json({ photos });
  } catch {
    return NextResponse.json({ error: "Failed to load photos" }, { status: 502 });
  }
}
