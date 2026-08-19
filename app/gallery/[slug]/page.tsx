import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebase/admin";
import { fetchDriveFolder } from "@/lib/drive/client";
import { verifyGalleryToken } from "@/lib/gallery/session";
import { driveImageUrl } from "@/lib/drive/public-url";
import { MasonryGrid } from "@/components/gallery/MasonryGrid";
import { PasswordGate } from "@/components/gallery/PasswordGate";
import { GalleryStatus } from "@/components/gallery/GalleryStatus";
import { GalleryActions } from "@/components/gallery/GalleryActions";
import { FooterCredit } from "@/components/gallery/FooterCredit";
import { GalleryAvatar } from "@/components/gallery/GalleryAvatar";
import { HeroImage } from "@/components/gallery/HeroImage";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { APP_NAME } from "@/lib/branding";
import { titleFontFamily, titleSizeClass, validTitleColor } from "@/lib/gallery/title-style";

interface Props {
  params: Promise<{ slug: string }>;
}

function formatEventDate(eventDate: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(eventDate));
  } catch {
    return eventDate;
  }
}

export default async function GalleryPage({ params }: Props) {
  const { slug } = await params;

  const snap = await getAdminDb()
    .collection("galleries")
    .where("slug", "==", slug)
    .limit(1)
    .get();

  if (snap.empty) notFound();

  const doc = snap.docs[0];
  const gallery = { id: doc.id, ...doc.data() } as {
    id: string;
    photographerId: string;
    name: string;
    slug: string;
    folderId: string;
    passwordHash?: string;
    pwChangedAt?: number;
    website?: string;
    instagram?: string;
    facebook?: string;
    allowDownload?: boolean;
    description?: string;
    eventDate?: string;
    location?: string;
    coverFileId?: string | null;
    bookLink?: string;
    bookEnabled?: boolean;
    titleFont?: string | null;
    titleColor?: string | null;
    titleSize?: string | null;
  };

  if (gallery.passwordHash) {
    const cookieStore = await cookies();
    const token = cookieStore.get(`gallery_token_${gallery.id}`)?.value;
    const valid = token ? await verifyGalleryToken(token) : null;

    if (!valid || valid.galleryId !== gallery.id || valid.v !== (gallery.pwChangedAt ?? 0)) {
      return <PasswordGate slug={slug} galleryName={gallery.name} />;
    }
  }

  let photographer = { name: "", photoURL: "" };
  try {
    const userSnap = await getAdminDb().collection("users").doc(gallery.photographerId).get();
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

  const totalPhotos = photos.filter((p) => p.mimeType.startsWith("image/")).length;
  const totalVideos = photos.length - totalPhotos;
  const photoPart = `${totalPhotos} ${totalPhotos === 1 ? "photo" : "photos"}`;
  const videoPart = `${totalVideos} ${totalVideos === 1 ? "video" : "videos"}`;
  const countLabel =
    totalVideos === 0 ? photoPart : totalPhotos === 0 ? videoPart : `${photoPart} · ${videoPart}`;

  const formattedDate = gallery.eventDate ? formatEventDate(gallery.eventDate) : null;

  const metaPieces = [
    gallery.description,
    formattedDate,
    gallery.location,
    photos.length > 0 ? countLabel : null,
  ].filter((p): p is string => !!p && p.length > 0);

  // "Book this photographer" CTA: only show if bookEnabled is true AND bookLink
  // is set. Falls back to website if bookLink is empty but website is set
  // (backward compat for galleries created before the bookLink field existed).
  const showBookCta = gallery.bookEnabled === true && !!(gallery.bookLink || gallery.website);
  const bookUrl = gallery.bookLink || gallery.website || null;

  return (
    <div className="min-h-screen bg-stone-50 relative">
      <div className="aurora-bg-light"><span /></div>

      {/* Sticky app header — sits ABOVE the hero, never overlapped.
          Left: PhotoDrive logo (links home). Right: language switcher.
          The photographer's identity lives below the hero (avatar + name) so
          it doesn't crowd the header and gets more visual prominence. */}
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Image
              src="/logo.png"
              alt={APP_NAME}
              width={180}
              height={44}
              className="h-10 w-auto"
              priority
            />
          </Link>
          <LanguageSwitcher variant="light" />
        </div>
      </header>

      {/* Hero banner — starts below the sticky header, never overlaps it. */}
      <section className="relative w-full h-[40vh] min-h-[260px] max-h-[440px] overflow-hidden">
        {coverPhoto && gallery.coverFileId ? (
          <HeroImage
            primaryUrl={driveImageUrl(coverPhoto, 2048)}
            fileId={gallery.coverFileId}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#17509e] via-[#0d2d5c] to-stone-900" />
        )}
        {/* Readability gradient over either source */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
        {/* Gallery name overlaid on the hero. The large bottom padding keeps
            the title + meta clear of the photographer avatar, which pops out
            of the hero bottom (~48px overlap + breathing room). */}
        <div className="absolute inset-x-0 bottom-0 px-4 sm:px-8 pb-24 pt-16 flex flex-col items-center text-center">
          <h1
            className={`${titleSizeClass(gallery.titleSize)} font-bold text-white drop-shadow-lg leading-tight`}
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
          {metaPieces.length > 0 && (
            <p className="mt-2 text-sm sm:text-base text-white/90 drop-shadow max-w-2xl">
              {metaPieces.join(" · ")}
            </p>
          )}
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
          <div className="rounded-full bg-white p-1 shadow-lg ring-1 ring-stone-200">
            <GalleryAvatar
              src={photographer.photoURL || undefined}
              name={photographer.name || gallery.name}
              fallbackLetter={gallery.name?.[0] || "P"}
              size={72}
            />
          </div>
          {photographer.name && (
            <p
              className="mt-2.5 text-lg font-semibold text-stone-900 text-center"
              style={{ fontFamily: "var(--font-brand), sans-serif" }}
            >
              {photographer.name}
            </p>
          )}

          {/* Action row: Share + Book CTA + social links */}
          <div className="mt-3 flex items-center justify-center flex-wrap gap-2">
            <GalleryActions bookUrl={showBookCta ? bookUrl : null} />
            {(gallery.website || gallery.instagram || gallery.facebook) && (
              <>
                {gallery.website && (
                  <a href={gallery.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-full px-3 py-1.5 hover:text-blue-700 hover:border-blue-600/50 hover:bg-blue-50 hover:shadow-sm transition-all">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M3.5 12h17M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" /></svg>
                    Website
                  </a>
                )}
                {gallery.instagram && (
                  <a href={gallery.instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-full px-3 py-1.5 hover:text-pink-600 hover:border-pink-500/50 hover:bg-pink-50 hover:shadow-sm transition-all">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="3.8" /><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" /></svg>
                    Instagram
                  </a>
                )}
                {gallery.facebook && (
                  <a href={gallery.facebook} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-full px-3 py-1.5 hover:text-[#1877F2] hover:border-[#1877F2]/50 hover:bg-blue-50 hover:shadow-sm transition-all">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M22 12a10 10 0 10-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0022 12z" /></svg>
                    Facebook
                  </a>
                )}
              </>
            )}
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
          <MasonryGrid photos={photos} subfolders={subfolders} galleryId={gallery.id} allowDownload={gallery.allowDownload !== false} />
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-stone-200 py-6 text-center space-y-1">
        {photographer.name && <FooterCredit photographerName={photographer.name} />}
        <p className="text-xs text-stone-400">Powered by {APP_NAME}</p>
      </div>
    </div>
  );
}
