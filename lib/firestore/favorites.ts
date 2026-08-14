import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { FavoriteDoc } from "./types";

const COLLECTION = "favorites";

function favoriteId(galleryId: string, photoId: string, sessionId: string) {
  return `${galleryId}_${photoId}_${sessionId}`;
}

export async function addFavorite(galleryId: string, photoId: string, sessionId: string) {
  const id = favoriteId(galleryId, photoId, sessionId);
  await setDoc(doc(db, COLLECTION, id), {
    galleryId,
    photoId,
    sessionId,
    createdAt: serverTimestamp(),
  });
}

export async function removeFavorite(galleryId: string, photoId: string, sessionId: string) {
  const id = favoriteId(galleryId, photoId, sessionId);
  await deleteDoc(doc(db, COLLECTION, id));
}

export async function getFavorites(galleryId: string, sessionId: string): Promise<string[]> {
  const q = query(
    collection(db, COLLECTION),
    where("galleryId", "==", galleryId),
    where("sessionId", "==", sessionId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => (d.data() as FavoriteDoc).photoId);
}
