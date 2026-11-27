import { NextRequest, NextResponse } from "next/server";
import { galleryAvailability, parseExpiryInput } from "@/lib/gallery/availability";
import { lapseEnforced, ownerPlanOf } from "@/lib/server/gallery-availability";
import { getStatsSummaries } from "@/lib/server/repos/galleryStats";
import { parseJson, route } from "@/lib/server/http";
import { GalleryBody } from "@/lib/shared/schemas/galleries";
import { getAdminDb } from "@/lib/firebase/admin";
import { isAdminToken, requireUser } from "@/lib/server/auth";
import { extractFolderId } from "@/lib/drive/url-parser";
import { generateSlug } from "@/lib/gallery/slug";
import { hashPassword } from "@/lib/gallery/password";
import { planCreate } from "@/lib/gallery/visibility";
import { sealPassword, forOwner } from "@/lib/gallery/password-vault";
import { newestFirst, ownerGalleryOf } from "@/lib/server/repos/galleries";
import { galleriesCol, gallerySelectionsCol, usersCol } from "@/lib/server/repos/collections";

export const POST = route("galleries.post", async (req: NextRequest) => {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const uid = auth.user.uid;

  // Paywall enforced server-side — the client-side subscription check alone is bypassable.
  if (!isAdminToken(auth.user)) {
    const userSnap = await usersCol().doc(uid).get();
    const u = userSnap.data();
    const active = u?.subscriptionStatus === "active" && (u?.subscriptionExpiresAt ?? 0) > Date.now();
    if (!active) {
      return NextResponse.json({ error: "Subscription required" }, { status: 402 });
    }
  }

  const parsedBody = await parseJson(req, GalleryBody);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const { name, driveUrl } = body as { name?: string; driveUrl?: string };

  if (!name || !driveUrl) {
    return NextResponse.json({ error: "name and driveUrl are required" }, { status: 400 });
  }

  const folderId = extractFolderId(driveUrl);
  if (!folderId) {
    return NextResponse.json({ error: "Invalid Google Drive folder URL" }, { status: 400 });
  }

  // Public or private (D18): a private gallery needs a password, a public one cannot have one.
  const plan = planCreate({ visibility: body.visibility, password: body.password });
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 });

  const slug = generateSlug();
  const passwordHash = plan.newPassword ? await hashPassword(plan.newPassword) : undefined;

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

  // S9-05: optional expiry date of the gallery ("YYYY-MM-DD").
  const expiry = parseExpiryInput(body.expiresAt);
  if (!expiry.ok) return NextResponse.json({ error: "Invalid expiry date" }, { status: 400 });

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
    visibility: plan.visibility,
    ...(passwordHash && plan.newPassword ? { passwordHash, passwordEnc: sealPassword(plan.newPassword) } : {}),
    ...(website ? { website } : {}),
    ...(instagram ? { instagram } : {}),
    ...(facebook ? { facebook } : {}),
    ...(description ? { description } : {}),
    ...(eventDate ? { eventDate } : {}),
    ...(location ? { location } : {}),
    ...(bookLink ? { bookLink } : {}),
    ...(expiry.value ? { expiresAt: expiry.value } : {}),
    bookEnabled,
    allowDownload,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await galleriesCol().add(data);

  return NextResponse.json(forOwner({ id: ref.id, ...data }), { status: 201 });
});

export const GET = route("galleries.get", async (req: NextRequest) => {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const uid = auth.user.uid;

  const snap = await galleriesCol()
    .where("photographerId", "==", uid)
    .get();

  // Reading never writes. A legacy plaintext password (if the one-off migration has not run yet) is still shown to its owner by
  // forOwner; scripts/migrations/seal-legacy-passwords.ts seals and clears them.
  const galleries = snap.docs.map(ownerGalleryOf).sort(newestFirst);

  // Attach each gallery's client-selection summary (favorites count + last
  // change) so the dashboard can badge cards without opening every selection.
  // One batched read of gallery_selections/{galleryId}; missing docs = none.
  const db = getAdminDb();
  const CHUNK = 300;
  for (let i = 0; i < galleries.length; i += CHUNK) {
    const part = galleries.slice(i, i + CHUNK);
    const snaps = await db.getAll(...part.map((g) => gallerySelectionsCol(db).doc(g.id)));
    snaps.forEach((s, idx) => {
      if (!s.exists) return;
      const d = s.data() ?? {};
      part[idx].selectionCount = typeof d.count === "number" ? d.count : 0;
      part[idx].selectionUpdatedAt = typeof d.updatedAt === "number" ? d.updatedAt : 0;
      if (typeof d.submission?.submittedAt === "number") part[idx].selectionSubmittedAt = d.submission.submittedAt;
    });
  }

  // Usage counts (S10-02), one more batched read; a gallery nobody has opened has none.
  // Is each gallery shown to visitors, in the owner's grace period, or offline (S9-04, S9-05)? Computed for the one owner who asked.
  const now = Date.now();
  const owner = lapseEnforced() ? await ownerPlanOf(uid, now) : null;
  for (const g of galleries) g.availability = galleryAvailability({ gallery: g, owner, enforceLapse: lapseEnforced(), now });
  const stats = await getStatsSummaries(galleries.map((g) => g.id), Date.now(), db);
  for (const g of galleries) {
    const s = stats.get(g.id);
    if (s) g.stats = s;
  }
  return NextResponse.json({ galleries });
});
