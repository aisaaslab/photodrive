import "server-only";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import type { GalleryDoc } from "@/lib/firestore/types";
import { forOwner } from "@/lib/gallery/password-vault";

/**
 * Deleting galleries (S4-02, SEC-4). A gallery's client favourites live in a separate collection, `gallery_selections/{galleryId}`,
 * together with the client's submission (name, e-mail, note). Before this, deleting a gallery or an account left those behind
 * forever. This is the one place that knows what belongs to a gallery; every deletion path goes through it.
 *
 *  - `gallery_selections/{galleryId}`: the shared favourites and the client's submission.
 *  - `favorites` (legacy, one document per favourite with a `galleryId` field; nothing writes it any more, but it may exist).
 *
 * The related documents are removed BEFORE the gallery document, so a failure part-way leaves the gallery in place and the
 * deletion can simply be repeated, instead of leaving orphans nobody can find.
 */

const BATCH = 400;
const IN_LIMIT = 30; // Firestore's limit for an `in` query

export type CascadeResult = { galleries: number; selections: number; legacyFavorites: number };

async function commitDeletes(db: Firestore, refs: FirebaseFirestore.DocumentReference[]): Promise<void> {
  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + BATCH)) batch.delete(ref);
    await batch.commit();
  }
}

/** Removes the given galleries and everything that belongs to them. Ids that do not exist are fine. */
export async function deleteGalleriesCascade(db: Firestore, galleryIds: string[]): Promise<CascadeResult> {
  const ids = [...new Set(galleryIds)];
  const result: CascadeResult = { galleries: 0, selections: 0, legacyFavorites: 0 };
  if (ids.length === 0) return result;

  // 1. shared favourites + client submissions (one document per gallery; delete() on a missing document is a no-op, so no read is needed)
  await commitDeletes(db, ids.map((id) => db.collection("gallery_selections").doc(id)));
  result.selections = ids.length;

  // 2. legacy per-favourite documents
  const legacy: FirebaseFirestore.DocumentReference[] = [];
  for (let i = 0; i < ids.length; i += IN_LIMIT) {
    const snap = await db.collection("favorites").where("galleryId", "in", ids.slice(i, i + IN_LIMIT)).get();
    legacy.push(...snap.docs.map((d) => d.ref));
  }
  await commitDeletes(db, legacy);
  result.legacyFavorites = legacy.length;

  // 3. the galleries themselves, last
  await commitDeletes(db, ids.map((id) => db.collection("galleries").doc(id)));
  result.galleries = ids.length;
  return result;
}

export const deleteGalleryCascade = (db: Firestore, galleryId: string) => deleteGalleriesCascade(db, [galleryId]);

/** Removes every gallery a photographer owns, with everything that belongs to them. */
export async function deleteUserGalleries(db: Firestore, uid: string): Promise<CascadeResult> {
  const snap = await db.collection("galleries").where("photographerId", "==", uid).get();
  return deleteGalleriesCascade(db, snap.docs.map((d) => d.id));
}

/** A gallery as an owner or administrator sees it: the sealed password is replaced by its decrypted value and `visibility` is always present. */
export type OwnerGallery = ReturnType<typeof forOwner<GalleryDoc>>;

/** Shapes a stored gallery document for an authenticated owner/admin response, newest first when sorted with `newestFirst`. */
export function ownerGalleryOf(d: { id: string; data(): DocumentData }): OwnerGallery {
  return forOwner({ ...(d.data() as Omit<GalleryDoc, "id">), id: d.id });
}

export const newestFirst = (a: { createdAt?: number }, b: { createdAt?: number }) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0);
