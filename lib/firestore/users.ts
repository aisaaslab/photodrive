import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { UserDoc } from "./types";

/**
 * Creates or merges the photographer's profile on login.
 *
 * `photoURL` from Google is only written on the FIRST create, or if the user
 * doesn't already have one. This preserves custom avatars uploaded via the
 * dashboard — without this check, every login would overwrite a uploaded
 * avatar with the Google profile photo (or empty string if none).
 */
export async function upsertUser(uid: string, profile: Omit<UserDoc, "uid" | "createdAt">) {
  const ref = doc(db, "users", uid);
  const existing = await getDoc(ref);
  const data: Record<string, unknown> = {
    uid,
    email: profile.email,
    name: profile.name,
    createdAt: serverTimestamp(),
  };
  // Only set photoURL from Google on first create, or if the user doesn't
  // already have one stored. This protects custom avatars from being
  // overwritten on subsequent logins.
  if (!existing.exists() || !existing.data()?.photoURL) {
    if (profile.photoURL) data.photoURL = profile.photoURL;
  }
  await setDoc(ref, data, { merge: true });
}
