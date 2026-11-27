import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { UserDoc } from "./types";
import { buildProfileWrite } from "./profile-write";

/**
 * Creates or merges the photographer's profile on login.
 *
 * `photoURL` and `name` from Google are only written on the FIRST create, or
 * if the user doesn't already have values. This preserves custom avatars
 * uploaded via the dashboard — and, just as importantly, display names the
 * user has corrected in Account settings. Without this check, every login
 * would overwrite both with the (never-changing) Google profile values. `createdAt` is written only once (see profile-write.ts).
 */
export async function upsertUser(uid: string, profile: Omit<UserDoc, "uid" | "createdAt">) {
  const ref = doc(db, "users", uid);
  const existing = await getDoc(ref);
  const data = buildProfileWrite(uid, existing.exists() ? existing.data() : undefined, profile, serverTimestamp());
  await setDoc(ref, data, { merge: true });
}
