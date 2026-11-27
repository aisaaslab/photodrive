import { route } from "@/lib/server/http";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { galleriesCol } from "@/lib/server/repos/collections";

export const GET = route("galleries.cover.get", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const uid = auth.user.uid;

  const snap = await galleriesCol().doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = snap.data()!;
  if (data.photographerId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) return NextResponse.json({ fileId: null });

  try {
    const params2 = new URLSearchParams({
      key: apiKey,
      q: `"${data.folderId}" in parents and mimeType contains "image/" and trashed = false`,
      fields: "files(id)",
      pageSize: "1",
      orderBy: "name",
    });

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params2}`
    );

    if (!res.ok) return NextResponse.json({ fileId: null });

    const json = await res.json();
    const fileId = json.files?.[0]?.id ?? null;

    return NextResponse.json(
      { fileId },
      { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } }
    );
  } catch {
    return NextResponse.json({ fileId: null });
  }
});
