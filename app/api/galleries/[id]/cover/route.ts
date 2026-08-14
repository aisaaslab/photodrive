import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await getAdminDb().collection("galleries").doc(id).get();
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
}
