import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { UserDoc } from "./types";

export async function upsertUser(uid: string, profile: Omit<UserDoc, "uid" | "createdAt">) {
  const ref = doc(db, "users", uid);
  await setDoc(
    ref,
    { uid, ...profile, createdAt: serverTimestamp() },
    { merge: true }
  );
}
