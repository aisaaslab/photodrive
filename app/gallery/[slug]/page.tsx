import { cache } from "react";
import { availabilityOf, isUnavailable } from "@/lib/server/gallery-availability";
import { ViewBeacon } from "@/components/gallery/ViewBeacon";
import { downloadsAllowed } from "@/lib/gallery/downloads";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { fetchDriveFolder } from "@/lib/drive/client";
import { verifyGalleryToken } from "@/lib/gallery/session";
import { isPrivate } from "@/lib/gallery/visibility";
import { driveImageUrl } from "@/lib/drive/public-url";
import { MasonryGrid } from "@/components/gallery/MasonryGrid";
import { PasswordGate } from "@/components/gallery/PasswordGate";
import { GalleryUnavailable } from "@/components/gallery/GalleryUnavailable";
import { GalleryStatus } from "@/components/gallery/GalleryStatus";
import { GalleryActions } from "@/components/gallery/GalleryActions";
import { FooterCredit, PoweredBy } from "@/components/gallery/FooterCredit";
import { HeroMeta } from "@/components/gallery/HeroMeta";
import { SocialLinks } from "@/components/gallery/SocialLinks";
import { GalleryAvatar } from "@/components/gallery/GalleryAvatar";
import { HeroImage } from "@/components/gallery/HeroImage";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Logo } from "@/components/ui/Logo";
import { APP_NAME } from "@/lib/branding";
import { titleFontFamily, titleSizeClass, validTitleColor } from "@/lib/gallery/title-style";
import { coverObjectPosition } from "@/lib/gallery/cover-position";
import { protectedCoverUrl, toProtectedFolders, toProtectedPhotos, usesProtectedTier } from "@/lib/server/protected-photos";
import { galleriesCol, usersCol } from "@/lib/server/repos/collections";

interface Props {
  params: Promise<{ slug: string }>;
}

/** One lookup per request, shared by the page and its metadata. */
const loadGalleryDoc = cache(async (slug: string) => {
  const snap = await galleriesCol().where("slug", "==", slug).limit(1).get();
  return snap.empty ? null : snap.docs[0];
});

/** A gallery that is not shown (switched off, past its expiry date, or its owner's plan lapsed) is not indexed; every other gallery keeps the site's default metadata. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = await loadGalleryDoc(slug);
  return doc && isUnavailable(await availabilityOf(doc.data() ?? {})) ? { robots: { index: false, follow: false } } : {};
}

export default async function GalleryPage({ params }: Props) {
  const { slug } = await params;

  const doc = await loadGalleryDoc(slug);
  if (!doc) notFound();
  const gallery = { id: doc.id, ...doc.data() } as {
    id: string;
    photographerId: string;
    name: string;
    slug: string;
    folderId: string;
    passwordHash?: string;
    /** Turned off by an administrator (S7-06). */
    disabled?: boolean;
    expiresAt?: number | null;
    visibility?: "public" | "private";
    pwChangedAt?: number;
    website?: string;
    instagram?: string;
    facebook?: string;
    allowDownload?: boolean;
    disableDownloadAfterSubmit?: boolean;
    downloadsLockedAt?: number | null;
    description?: string;
    eventDate?: string;
    location?: string;
    coverFileId?: string | null;
    coverPosX?: number | null;
    coverPosY?: number | null;
    bookLink?: string;
    bookEnabled?: boolean;
    titleFont?: string | null;
    titleColor?: string | null;
    titleSize?: string | null;
    headerBranding?: "photographer" | null;
  };

  if (isUnavailable(await availabilityOf(gallery))) return <GalleryUnavailable />;

  if (isPrivate(gallery)) {
    const cookieStore = await cookies();
    const token = cookieStore.get(`gallery_token_${gallery.id}`)?.value;
    const valid = token ? await verifyGalleryToken(token) : null;

    if (!valid || valid.galleryId !== gallery.id || valid.v !== (gallery.pwChangedAt ?? 0)) {
      let owner = { name: "", photoURL: "" };
      try {
        const ud = (await usersCol().doc(gallery.photographerId).get()).data();
        owner = { name: typeof ud?.name === "string" ? ud.name : "", photoURL: typeof ud?.photoURL === "string" ? ud.photoURL : "" };
      } catch { /* the gate works without it */ }
      return <PasswordGate slug={slug} galleryName={gallery.name} photographerName={owner.name} photographerPhotoURL={owner.photoURL} />;
    }
  }

  let photographer = { name: "", photoURL: "" };
  try {
    const userSnap = await usersCol().doc(gallery.photographerId).get();
    if (userSnap.exists) {
      const ud = userSnap.data()!;
      photographer = {
        name: typeof ud.name === "string" ? ud.name : "",
        photoURL: typeof ud.photoURL === "string" ? ud.photoURL : "",
      };
    }
  } catch {
    // ignore — keep the empty fallback
  }

  let photos: import("@/lib/drive/types").DriveFile[] = [];
  let subfolders: import("@/lib/drive/types").DriveFolder[] = [];
  let driveError = false;
  try {
    const result = await fetchDriveFolder(gallery.folderId);
    photos = result.files;
    subfolders = result.subfolders;
  } catch {
    driveError = true;
  }

  // Cover image: if the photographer picked one (coverFileId) and that file is
  // still in the folder, render it via HeroImage (a client component with a
  // self-healing fallback chain — the lh3 CDN URL can be rate-limited).
  // Anything else (no cover, photo deleted from Drive) falls back to the
  // branded gradient hero.
  const coverPhoto = gallery.coverFileId
    ? photos.find((p) => p.id === gallery.coverFileId) ?? null
    : null;

  // Protected tier (D15, S3-03): private galleries and galleries with downloads off (when MEDIA_PROTECTED_TIER=1) send the
  // browser opaque tokens and signed same-site URLs instead of Drive ids and Google URLs.
  const allowDownload = downloadsAllowed(gallery);
  const protectedTier = usesProtectedTier({ private: isPrivate(gallery), allowDownload });
  const clientPhotos = protectedTier ? toProtectedPhotos(gallery.id, photos, allowDownload) : photos;
  const clientFolders = protectedTier ? toProtectedFolders(gallery.id, subfolders) : subfolders;
  const protectedCover = protectedTier ? protectedCoverUrl(gallery.id, gallery.coverFileId ?? undefined, photos) : null;

  const totalPhotos = photos.filter((p) => p.mimeType.startsWith("image/")).length;
  const totalVideos = photos.length - totalPhotos;

  // "Book this photographer" CTA: only show if bookEnabled is true AND bookLink
  // is set. Falls back to website if bookLink is empty but website is set
  // (backward compat for galleries created before the bookLink field existed).
  const showBookCta = gallery.bookEnabled === true && !!(gallery.bookLink || gallery.website);
  const bookUrl = gallery.bookLink || gallery.website || null;

  return (
    <div className="min-h-screen bg-canvas relative">
      

      {/* Sticky app header — sits ABOVE the hero, never overlapped.
          Left: PhotoDrive logo (links home) — or, when the photographer opted
          in (headerBranding), their own avatar + name instead. Right: language
          switcher. The photographer's identity also lives below the hero
          (avatar + name) where it gets more visual prominence. */}
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between">
          {gallery.headerBranding === "photographer" && photographer.name ? (
            (() => {
              const brand = (
                <>
                  <GalleryAvatar
                    src={photographer.photoURL || undefined}
                    name={photographer.name}
                    fallbackLetter={gallery.name?.[0] || "P"}
                    size={32}
                  />
                  <span
                    className="text-sm sm:text-base font-semibold text-fg truncate"
                    style={{ fontFamily: "var(--font-brand), sans-serif" }}
                  >
                    {photographer.name}
                  </span>
                </>
              );
              return gallery.website ? (
                <a href={gallery.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 min-w-0">
                  {brand}
                </a>
              ) : (
                <div className="flex items-center gap-2.5 min-w-0">{brand}</div>
              );
            })()
          ) : (
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <Logo priority />
            </Link>
          )}
          <LanguageSwitcher variant="light" />
        </div>
      </header>

      {/* Hero banner — starts below the sticky header, never overlaps it. */}
      <section className="relative w-full h-[40vh] min-h-[300px] sm:min-h-[260px] max-h-[440px] overflow-hidden">
        {coverPhoto && gallery.coverFileId ? (
          <HeroImage
            primaryUrl={protectedTier ? (protectedCover ?? "") : driveImageUrl(coverPhoto, 2048)}
            fileId={protectedTier ? undefined : gallery.coverFileId}
            galleryId={gallery.id}
            objectPosition={coverObjectPosition(gallery.coverPosX, gallery.coverPosY)}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#17509e] via-[#0d2d5c] to-surface-2" />
        )}
        {/* Readability gradient over either source */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
        {/* Gallery name overlaid on the hero. The large bottom padding keeps
            the title + meta clear of the photographer avatar, which pops out
            of the hero bottom (~48px overlap + breathing room). */}
        <div className="absolute inset-x-0 bottom-0 px-4 sm:px-8 pb-20 sm:pb-24 pt-12 sm:pt-16 flex flex-col items-center text-center">
          <h1
            className={`${titleSizeClass(gallery.titleSize)} font-bold text-fg drop-shadow-lg leading-tight break-words`}
            style={{
              // Photographer-picked font + color (curated set, validated on
              // write). Falls back to the brand font / white.
              fontFamily: titleFontFamily(gallery.titleFont),
              ...(validTitleColor(gallery.titleColor)
                ? { color: gallery.titleColor as string }
                : {}),
            }}
          >
            {gallery.name}
          </h1>
          <HeroMeta
            description={gallery.description}
            eventDate={gallery.eventDate}
            location={gallery.location}
            photoCount={totalPhotos}
            videoCount={totalVideos}
          />
        </div>
      </section>

      {/* Photographer identity bar — avatar "pops" out of the hero bottom.
          This is the professional pattern used by Pixieset, SmugMug, etc.:
          a circular avatar that overlaps the hero, with the photographer name
          and action buttons below it. */}
      <div className="relative max-w-4xl mx-auto px-4 sm:px-8">
        {/* Avatar — centered, half-overlapping the hero. The negative margin
            pulls it up so its top half sits on the hero image. */}
        <div className="flex flex-col items-center -mt-10 sm:-mt-12 relative z-10">
          <div className="rounded-full bg-surface p-1 shadow-lg ring-1 ring-line">
            <GalleryAvatar
              src={photographer.photoURL || undefined}
              name={photographer.name || gallery.name}
              fallbackLetter={gallery.name?.[0] || "P"}
              size={72}
            />
          </div>
          {photographer.name && (
            <p
              className="mt-2.5 text-lg font-semibold text-fg text-center"
              style={{ fontFamily: "var(--font-brand), sans-serif" }}
            >
              {photographer.name}
            </p>
          )}

          {/* Action row: Share + Book CTA + social links */}
          <div className="mt-3 flex items-center justify-center flex-wrap gap-2">
            <GalleryActions bookUrl={showBookCta ? bookUrl : null} />
            <SocialLinks website={gallery.website} instagram={gallery.instagram} facebook={gallery.facebook} />
          </div>
        </div>
      </div>

      {/* Photos */}
      <div className="px-2 sm:px-6 pb-20 pt-8 sm:pt-10 max-w-screen-2xl mx-auto">
        {driveError ? (
          <GalleryStatus type="driveError" />
        ) : photos.length === 0 ? (
          <GalleryStatus type="noPhotos" />
        ) : (
          <>
            <ViewBeacon galleryId={gallery.id} />
            <MasonryGrid photos={clientPhotos} subfolders={clientFolders} galleryId={gallery.id} allowDownload={allowDownload} />
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-line py-6 text-center space-y-1">
        {photographer.name && <FooterCredit photographerName={photographer.name} />}
        <PoweredBy appName={APP_NAME} />
      </div>
    </div>
  );
}
