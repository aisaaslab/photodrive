import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { GALLERY_FILTERS, decodeCursor, listGalleriesPage, type GalleryFilter } from "@/lib/server/repos/admin-galleries";

/**
 * Admin-only: one page of galleries (S7-06). `?q=` searches links by prefix, `?filter=` is all | disabled, `?cursor=` continues a previous
 * page, `?limit=` is 1 to 50 (default 25). Nothing here reads a whole collection and no password is ever returned.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  const params = new URL(req.url).searchParams;
  const filter = (params.get("filter") ?? "all") as GalleryFilter;
  if (!GALLERY_FILTERS.includes(filter)) return NextResponse.json({ error: "Unknown filter" }, { status: 400 });
  if (params.get("cursor") && !decodeCursor(params.get("cursor"))) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  const limit = Number(params.get("limit") ?? 25);

  return NextResponse.json(await listGalleriesPage({ q: (params.get("q") ?? "").slice(0, 200), filter, cursor: params.get("cursor"), limit: Number.isFinite(limit) ? limit : 25 }));
}
