import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyPassword } from "@/lib/gallery/password";
import { signGalleryToken } from "@/lib/gallery/session";

export async function POST(req: NextRequest) {
  const { slug, password } = await req.json();

  if (!slug || !password) {
    return NextResponse.json({ error: "slug and password required" }, { status: 400 });
  }

  const snap = await getAdminDb()
    .collection("galleries")
    .where("slug", "==", slug)
    .limit(1)
    .get();

  if (snap.empty) {
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  }

  const gallery = snap.docs[0];
  const data = gallery.data();

  if (!data.passwordHash) {
    return NextResponse.json({ error: "Gallery has no password" }, { status: 400 });
  }

  const valid = await verifyPassword(password, data.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = await signGalleryToken(gallery.id, (data.pwChangedAt as number) ?? 0);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(`gallery_token_${gallery.id}`, token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return response;
}
