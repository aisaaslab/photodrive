import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { UserDoc } from "./types";

/**
 * Creates or merges the photographer's profile on login.
 *
 * `photoURL` and `name` from Google are only written on the FIRST create, or
 * if the user doesn't already have values. This preserves custom avatars
 * uploaded via the dashboard — and, just as importantly, display names the
 * user has corrected in Account settings. Without this check, every login
 * would overwrite both with the (never-changing) Google profile values.
 */
export async function upsertUser(uid: string, profile: Omit<UserDoc, "uid" | "createdAt">) {
  const ref = doc(db, "users", uid);
  const existing = await getDoc(ref);
  const data: Record<string, unknown> = {
    uid,
    email: profile.email,
    createdAt: serverTimestamp(),
  };
  if (!existing.exists()) {
    data.name = profile.name;
  } else if (!existing.data()?.name) {
    // Set the Google name only when there is nothing stored yet — never
    // overwrite a user-edited name.
    data.name = profile.name;
  }
  // Only set photoURL from Google on first create, or if the user doesn't
  // already have one stored. This protects custom avatars from being
  // overwritten on subsequent logins.
  if (!existing.exists() || !existing.data()?.photoURL) {
    if (profile.photoURL) data.photoURL = profile.photoURL;
  }
  await setDoc(ref, data, { merge: true });
}
