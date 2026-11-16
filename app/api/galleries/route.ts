import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { extractFolderId } from "@/lib/drive/url-parser";
import { generateSlug } from "@/lib/gallery/slug";
import { hashPassword } from "@/lib/gallery/password";
import { sealPassword, forOwner, migrateLegacyPassword } from "@/lib/gallery/password-vault";
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

  // Optional gallery metadata: free-text description, event date (YYYY-MM-DD),
  // and location. All guarded so absent/junk values are dropped, not stored.
  const description =
    typeof body.description === "string" ? body.description.trim() || undefined : undefined;
  const eventDate =
    typeof body.eventDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.eventDate)
      ? body.eventDate
      : undefined;
  const location =
    typeof body.location === "string" ? body.location.trim() || undefined : undefined;
  // "Book this photographer" CTA: a URL + on/off toggle. Defaults to off.
  const bookLink =
    typeof body.bookLink === "string" ? body.bookLink.trim() || undefined : undefined;
  const bookEnabled = body.bookEnabled === true;

  const now = Date.now();
  const data = {
    photographerId: uid,
    name,
    slug,
    folderId,
    // `passwordHash` (bcrypt) is what verification checks against. The
    // dashboard and admin panel also show photographers the password they set,
    // so they can remind a client who lost it; that value is stored only in
    // sealed (AES-GCM) form as `passwordEnc` — never as plaintext. See
    // lib/gallery/password-vault.ts.
    ...(passwordHash ? { passwordHash, passwordEnc: sealPassword(password) } : {}),
    ...(website ? { website } : {}),
    ...(instagram ? { instagram } : {}),
    ...(facebook ? { facebook } : {}),
    ...(description ? { description } : {}),
    ...(eventDate ? { eventDate } : {}),
    ...(location ? { location } : {}),
    ...(bookLink ? { bookLink } : {}),
    bookEnabled,
    allowDownload,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await getAdminDb().collection("galleries").add(data);

  return NextResponse.json(forOwner({ id: ref.id, ...data }), { status: 201 });
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
  // Legacy galleries stored the password in plaintext; seal it the first time
  // it is read, then expose the decrypted value to the owner only.
  const raw = await Promise.all(
    snap.docs.map(async (d) =>
      forOwner(
        await migrateLegacyPassword(d.ref, { id: d.id, ...(d.data() as Record<string, unknown>) })
      )
    )
  );
  const galleries = (raw as unknown as GalleryDoc[]).sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));

  // Attach each gallery's client-selection summary (favorites count + last
  // change) so the dashboard can badge cards without opening every selection.
  // One batched read of gallery_selections/{galleryId}; missing docs = none.
  const db = getAdminDb();
  const CHUNK = 300;
  for (let i = 0; i < galleries.length; i += CHUNK) {
    const part = galleries.slice(i, i + CHUNK);
    const snaps = await db.getAll(...part.map((g) => db.collection("gallery_selections").doc(g.id)));
    snaps.forEach((s, idx) => {
      if (!s.exists) return;
      const d = s.data() ?? {};
      part[idx].selectionCount = typeof d.count === "number" ? d.count : 0;
      part[idx].selectionUpdatedAt = typeof d.updatedAt === "number" ? d.updatedAt : 0;
      if (typeof d.submission?.submittedAt === "number") part[idx].selectionSubmittedAt = d.submission.submittedAt;
    });
  }
  return NextResponse.json({ galleries });
}
