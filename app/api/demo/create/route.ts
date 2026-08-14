import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { extractFolderId } from "@/lib/drive/url-parser";

export async function POST(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  const clientIp = forwarded
    ? forwarded.split(",")[0].trim()
    : (req.headers.get("x-real-ip") ?? "unknown");

  const body = await req.json();
  const { driveUrl } = body;

  if (!driveUrl) {
    return NextResponse.json({ error: "driveUrl is required" }, { status: 400 });
  }

  const folderId = extractFolderId(driveUrl);
  if (!folderId) {
    return NextResponse.json({ error: "Invalid Google Drive folder URL" }, { status: 400 });
  }

  const db = getAdminDb();

  const existing = await db
    .collection("demo_galleries")
    .where("ip", "==", clientIp)
    .get();

  if (existing.size >= 3) {
    return NextResponse.json({ error: "Demo limit reached" }, { status: 429 });
  }

  const now = Date.now();
  const ref = await db.collection("demo_galleries").add({
    folderId,
    createdAt: now,
    expiresAt: now + 10 * 60 * 1000,
    ip: clientIp,
  });

  return NextResponse.json({ id: ref.id }, { status: 201 });
}
