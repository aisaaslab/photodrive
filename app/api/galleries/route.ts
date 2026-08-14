import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { extractFolderId } from "@/lib/drive/url-parser";
import { generateSlug } from "@/lib/gallery/slug";
import { hashPassword } from "@/lib/gallery/password";
import { isAdmin } from "@/lib/firebase/admin-guard";
import type { GalleryDoc } from "@/lib/firestore/types";

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

export async function POST(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Paywall enforced server-side — the client-side subscription check alone is bypassable.
  if (!isAdmin(uid)) {
    const userSnap = await getAdminDb().collection("users").doc(uid).get();
    const u = userSnap.data();
    const active = u?.subscriptionStatus === "active" && (u?.subscriptionExpiresAt ?? 0) > Date.now();
    if (!active) {
      return NextResponse.json({ error: "Subscription required" }, { status: 402 });
    }
  }

  const body = await req.json();
  const { name, driveUrl, password } = body;

  if (!name || !driveUrl) {
    return NextResponse.json({ error: "name and driveUrl are required" }, { status: 400 });
  }

  const folderId = extractFolderId(driveUrl);
  if (!folderId) {
    return NextResponse.json({ error: "Invalid Google Drive folder URL" }, { status: 400 });
  }

  const slug = generateSlug();
  const passwordHash = password ? await hashPassword(password) : undefined;

  const normUrl = (u: unknown): string | undefined => {
    if (typeof u !== "string") return undefined;
    const t = u.trim();
    if (!t) return undefined;
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
  };
  const website = normUrl(body.website);
  const instagram = normUrl(body.instagram);
  const facebook = normUrl(body.facebook);
  // Downloads are allowed unless explicitly turned off when creating.
  const allowDownload = body.allowDownload !== false;

  const now = Date.now();
  const data = {
    photographerId: uid,
    name,
    slug,
    folderId,
    // `passwordHash` is what verification checks against. The plaintext
    // `password` is stored alongside it deliberately: the dashboard and the
    // admin panel show photographers the password they set, so they can remind
    // a client who lost it. That convenience is exactly why firestore.rules
    // denies the browser all access to gallery documents — publish those rules
    // (install guide, Step 13) and this field is only ever readable by the
    // server. To not store it at all, drop `password` here and in
    // app/api/galleries/[id] and app/api/admin/galleries/[id]; the only cost is
    // that "remind me of the password" becomes "set a new one".
    ...(passwordHash ? { passwordHash, password } : {}),
    ...(website ? { website } : {}),
    ...(instagram ? { instagram } : {}),
    ...(facebook ? { facebook } : {}),
    allowDownload,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await getAdminDb().collection("galleries").add(data);

  return NextResponse.json({ id: ref.id, ...data }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await getAdminDb()
    .collection("galleries")
    .where("photographerId", "==", uid)
    .get();

  // Cast on the map result, not on the whole chain: .sort() runs on the
  // intermediate array, which TypeScript infers as { id: string } alone.
  const galleries = (snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, unknown>),
  })) as GalleryDoc[]).sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));
  return NextResponse.json({ galleries });
}
