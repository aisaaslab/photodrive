import "server-only";
import { FieldPath, type DocumentData, type Firestore, type Query } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { galleryVisibility } from "@/lib/gallery/visibility";
import { toMs } from "@/lib/server/migrations/restore-created-at";
import { galleriesCol, usersCol } from "./collections";
import { decodeCursor, pageThrough } from "./paging";

/**
 * The admin Galleries list (S7-06). One indexed query per page: newest first, or by link (`slug`) prefix when searching, or only the ones
 * that are turned off. Owners are looked up for the visible page only. Passwords are never part of a row.
 */
export type GalleryFilter = "all" | "disabled";
export const GALLERY_FILTERS: readonly GalleryFilter[] = ["all", "disabled"];
export { decodeCursor };

export type AdminGalleryRow = {
  id: string; name: string; slug: string;
  createdAt: number | null; updatedAt: number | null;
  visibility: "public" | "private"; allowDownload: boolean;
  disabled: boolean; disabledAt: number | null; disabledReason: string | null;
  owner: { uid: string; name: string; email: string; photoURL: string | null } | null;
};
export type GalleriesPage = { galleries: AdminGalleryRow[]; nextCursor: string | null; total: number; disabledCount: number };

export function buildGalleryQuery(db: Firestore, filter: GalleryFilter, q: string): { query: Query; field: string } {
  const col = galleriesCol(db);
  const needle = q.trim().toLowerCase();
  if (needle) return { query: col.where("slug", ">=", needle).where("slug", "<=", needle + "").orderBy("slug").orderBy(FieldPath.documentId()), field: "slug" };
  if (filter === "disabled") return { query: col.where("disabled", "==", true).orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc"), field: "createdAt" };
  return { query: col.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc"), field: "createdAt" };
}

const rowOf = (id: string, d: DocumentData, owners: Map<string, AdminGalleryRow["owner"]>): AdminGalleryRow => ({
  id, name: typeof d.name === "string" ? d.name : "", slug: typeof d.slug === "string" ? d.slug : "",
  createdAt: toMs(d.createdAt), updatedAt: toMs(d.updatedAt),
  visibility: galleryVisibility(d), allowDownload: d.allowDownload !== false,
  disabled: d.disabled === true, disabledAt: toMs(d.disabledAt), disabledReason: typeof d.disabledReason === "string" && d.disabledReason ? d.disabledReason : null,
  owner: (typeof d.photographerId === "string" && owners.get(d.photographerId)) || null,
});

export async function listGalleriesPage(opts: { q?: string; filter?: GalleryFilter; cursor?: string | null; limit?: number }, db: Firestore = getAdminDb()): Promise<GalleriesPage> {
  const filter: GalleryFilter = opts.filter === "disabled" ? "disabled" : "all";
  const limit = Math.min(50, Math.max(1, Math.floor(opts.limit ?? 25)));
  const q = (opts.q ?? "").trim();
  const { query, field } = buildGalleryQuery(db, filter, q);
  // A search runs on the link; a status chosen with it is applied to the matches.
  const keep = q && filter === "disabled" ? (d: DocumentData) => d.disabled === true : undefined;
  const { docs, nextCursor } = await pageThrough({ query, field, limit, cursor: decodeCursor(opts.cursor), keep });

  const ownerIds = [...new Set(docs.map((d) => d.get("photographerId")).filter((x): x is string => typeof x === "string" && !!x))];
  const owners = new Map<string, AdminGalleryRow["owner"]>();
  if (ownerIds.length) {
    for (const snap of await db.getAll(...ownerIds.map((uid) => usersCol(db).doc(uid)))) {
      const u = snap.data();
      owners.set(snap.id, { uid: snap.id, name: typeof u?.name === "string" ? u.name : "", email: typeof u?.email === "string" ? u.email : "", photoURL: typeof u?.photoURL === "string" && u.photoURL ? u.photoURL : null });
    }
  }
  const [total, disabledCount] = await Promise.all([
    galleriesCol(db).count().get().then((s) => s.data().count),
    galleriesCol(db).where("disabled", "==", true).count().get().then((s) => s.data().count),
  ]);
  return { galleries: docs.map((d) => rowOf(d.id, d.data(), owners)), nextCursor, total, disabledCount };
}
