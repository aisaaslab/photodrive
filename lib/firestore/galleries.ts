import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { GalleryDoc } from "./types";

const COLLECTION = "galleries";

export async function createGallery(
  data: Omit<GalleryDoc, "id" | "createdAt" | "updatedAt">
): Promise<GalleryDoc> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: ref.id, ...data, createdAt: Date.now(), updatedAt: Date.now() };
}

export async function getGalleryBySlug(slug: string): Promise<GalleryDoc | null> {
  const q = query(collection(db, COLLECTION), where("slug", "==", slug));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as GalleryDoc;
}

export async function getGalleryById(id: string): Promise<GalleryDoc | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as GalleryDoc;
}

export async function getGalleriesForUser(photographerId: string): Promise<GalleryDoc[]> {
  const q = query(
    collection(db, COLLECTION),
    where("photographerId", "==", photographerId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as GalleryDoc));
}

export async function updateGallery(id: string, data: Partial<GalleryDoc>) {
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteGallery(id: string) {
  await deleteDoc(doc(db, COLLECTION, id));
}
