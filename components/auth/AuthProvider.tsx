"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, updateDoc, deleteField } from "firebase/firestore";
import { auth } from "@/lib/firebase/client";
import { db } from "@/lib/firebase/client";
import { upsertUser } from "@/lib/firestore/users";
import { UserDoc } from "@/lib/firestore/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  // Firestore profile — the source of truth for photoURL and name on the
  // public gallery page. Firebase Auth's photoURL can't hold a data URL (too
  // long), so custom avatars live in Firestore only. The dashboard header and
  // gallery page both read from here.
  profile: UserDoc | null;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  profile: null,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserDoc | null>(null);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        setProfile({ uid: snap.id, ...(snap.data() as Omit<UserDoc, "uid">) });
      }
    } catch {
      // Firestore read may fail if rules aren't published yet — degrade
      // gracefully, the app still works without the profile.
    }
  }, [user]);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      if (firebaseUser) {
        await upsertUser(firebaseUser.uid, {
          email: firebaseUser.email ?? "",
          name: firebaseUser.displayName ?? "",
          photoURL: firebaseUser.photoURL ?? undefined,
        });
        // Fetch the Firestore profile (may differ from Firebase Auth if the
        // user uploaded a custom avatar).
        try {
          const snap = await getDoc(doc(db, "users", firebaseUser.uid));
          if (snap.exists()) {
            setProfile({ uid: snap.id, ...(snap.data() as Omit<UserDoc, "uid">) });
          }
        } catch {
          // ignore — profile is null, app still works
        }
      } else {
        setProfile(null);
      }
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, profile, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Updates the photographer's profile directly in Firestore (allowed by
 * firestore.rules — photoURL and name are not locked fields). Used by the
 * AvatarEditor to save a custom avatar without needing Firebase Storage.
 *
 * Pass `photoURL: undefined` to DELETE the field (the avatar is removed
 * entirely, not stored as null/empty — the gallery page then shows the
 * initial-letter fallback).
 */
export async function updateUserProfile(
  uid: string,
  updates: Partial<Pick<UserDoc, "name">> & { photoURL?: string | undefined }
) {
  const data: Record<string, unknown> = {};
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.photoURL !== undefined) {
    data.photoURL = updates.photoURL;
  } else if ("photoURL" in updates) {
    // photoURL was explicitly passed as undefined → delete the field.
    data.photoURL = deleteField();
  }
  if (Object.keys(data).length > 0) {
    await updateDoc(doc(db, "users", uid), data);
  }
}
