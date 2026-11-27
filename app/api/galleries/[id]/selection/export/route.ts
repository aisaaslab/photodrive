import { NextRequest, NextResponse } from "next/server";
import { route } from "@/lib/server/http";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/server/auth";
import { galleriesCol, gallerySelectionsCol } from "@/lib/server/repos/collections";
import { formatExport, parseExt, parseFormat, type ExportItem } from "@/lib/gallery/selection-export";

/**
 * The picked file names of a gallery as a download (S10-01), for the gallery's owner only: anyone else, signed in or not, gets the same
 * 404 as for a gallery that does not exist. ?format=txt|csv (default txt), ?ext=keep|strip (default keep).
 */
export const GET = route("galleries.selection.export", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = getAdminDb();
  const gallery = await galleriesCol(db).doc(id).get();
  if (!gallery.exists || gallery.data()?.photographerId !== auth.user.uid) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const snap = await gallerySelectionsCol(db).doc(id).get();
  const items: ExportItem[] = snap.exists ? (snap.data()?.items ?? []) : [];
  const format = parseFormat(req.nextUrl.searchParams.get("format"));
  const ext = parseExt(req.nextUrl.searchParams.get("ext"));

  return new NextResponse(formatExport(items, format, ext), {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="selection.${format}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
