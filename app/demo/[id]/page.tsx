import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { fetchDriveFolder } from "@/lib/drive/client";
import { MasonryGrid } from "@/components/gallery/MasonryGrid";
import { GalleryStatus } from "@/components/gallery/GalleryStatus";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { CountdownBanner } from "./CountdownBanner";
import { ExpiredScreen } from "./ExpiredScreen";
import { DemoTitle } from "./DemoTitle";
import { APP_NAME } from "@/lib/branding";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DemoPage({ params }: Props) {
  const { id } = await params;

  const doc = await getAdminDb().collection("demo_galleries").doc(id).get();
  if (!doc.exists) notFound();

  const data = doc.data() as {
    folderId: string;
    createdAt: number;
    expiresAt: number;
  };

  if (data.expiresAt < Date.now()) {
    return <ExpiredScreen />;
  }

  let photos: import("@/lib/drive/types").DriveFile[] = [];
  let subfolders: import("@/lib/drive/types").DriveFolder[] = [];
  let driveError = false;
  try {
    const result = await fetchDriveFolder(data.folderId);
    photos = result.files;
    subfolders = result.subfolders;
  } catch {
    driveError = true;
  }

  return (
    <div className="min-h-screen bg-stone-50 relative">
      <div className="aurora-bg-light"><span /></div>

      <CountdownBanner expiresAt={data.expiresAt} />

      <div className="flex items-center justify-between px-4 sm:px-8 py-4">
        <span className="text-stone-900 font-bold text-xl" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{APP_NAME}</span>
        <LanguageSwitcher variant="light" />
      </div>

      <div className="text-center pb-2 px-4">
        <DemoTitle />
      </div>

      <div className="px-2 sm:px-6 pb-20 pt-4 sm:pt-6 max-w-screen-2xl mx-auto">
        {driveError ? (
          <GalleryStatus type="driveError" />
        ) : photos.length === 0 ? (
          <GalleryStatus type="noPhotos" />
        ) : (
          <MasonryGrid photos={photos} subfolders={subfolders} galleryId={id} />
        )}
      </div>

      <div className="border-t border-stone-200 py-6 text-center">
        <p className="text-xs text-stone-400">Powered by {APP_NAME}</p>
      </div>
    </div>
  );
}
