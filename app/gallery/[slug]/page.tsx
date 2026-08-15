import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebase/admin";
import { fetchDriveFolder } from "@/lib/drive/client";
import { verifyGalleryToken } from "@/lib/gallery/session";
import { MasonryGrid } from "@/components/gallery/MasonryGrid";
import { PasswordGate } from "@/components/gallery/PasswordGate";
import { GalleryStatus } from "@/components/gallery/GalleryStatus";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { APP_NAME } from "@/lib/branding";

interface Props {
  params: Promise<{ slug: string }>;
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
    name: string;
    slug: string;
    folderId: string;
    passwordHash?: string;
    pwChangedAt?: number;
    website?: string;
    instagram?: string;
    facebook?: string;
    allowDownload?: boolean;
  };

  if (gallery.passwordHash) {
    const cookieStore = await cookies();
    const token = cookieStore.get(`gallery_token_${gallery.id}`)?.value;
    const valid = token ? await verifyGalleryToken(token) : null;

    if (!valid || valid.galleryId !== gallery.id || valid.v !== (gallery.pwChangedAt ?? 0)) {
      return <PasswordGate slug={slug} galleryName={gallery.name} />;
    }
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

  return (
    <div className="min-h-screen bg-stone-50 relative">
      <div className="aurora-bg-light"><span /></div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-8 pt-5 pb-2">
        <Link href="/" className="text-stone-900 font-bold text-xl hover:opacity-70 transition-opacity" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{APP_NAME}</Link>
        <LanguageSwitcher variant="light" />
      </div>

      {/* Title */}
      <div className="text-center pt-4 pb-2 px-4">
        <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {gallery.name}
        </h1>
        {(gallery.website || gallery.instagram || gallery.facebook) && (
          <div className="flex items-center justify-center flex-wrap gap-2 mt-3">
            {gallery.website && (
              <a href={gallery.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-full px-3 py-1.5 hover:text-[#17509e] hover:border-[#17509e]/40 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M3.5 12h17M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" /></svg>
                Website
              </a>
            )}
            {gallery.instagram && (
              <a href={gallery.instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-full px-3 py-1.5 hover:text-[#17509e] hover:border-[#17509e]/40 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="3.8" /><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" /></svg>
                Instagram
              </a>
            )}
            {gallery.facebook && (
              <a href={gallery.facebook} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-full px-3 py-1.5 hover:text-[#17509e] hover:border-[#17509e]/40 transition-colors">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M22 12a10 10 0 10-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0022 12z" /></svg>
                Facebook
              </a>
            )}
          </div>
        )}
      </div>

      {/* Photos */}
      <div className="px-2 sm:px-6 pb-20 pt-4 sm:pt-6 max-w-screen-2xl mx-auto">
        {driveError ? (
          <GalleryStatus type="driveError" />
        ) : photos.length === 0 ? (
          <GalleryStatus type="noPhotos" />
        ) : (
          <MasonryGrid photos={photos} subfolders={subfolders} galleryId={gallery.id} allowDownload={gallery.allowDownload !== false} />
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-stone-200 py-6 text-center">
        <p className="text-xs text-stone-400">Powered by {APP_NAME}</p>
      </div>
    </div>
  );
}
