import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";

/**
 * S4-01: restore sign-up dates that the sign-in bug reset. Until it was fixed, every sign-in overwrote `users/{uid}.createdAt` with
 * "now", so a profile's date is the user's last sign-in, never earlier than their real sign-up. Firebase Auth still knows the real
 * creation time. The plan is conservative: a date is only ever moved EARLIER, and only when it is later than Auth's creation time
 * by more than a day (the first write happens seconds after the account exists, so a smaller gap is the genuine date).
 */
export const TOLERANCE_MS = 24 * 60 * 60 * 1000;

export type AuthRecord = { uid: string; creationMs: number };
export type StoredCreatedAt = Timestamp | number | null | undefined;

export type RestoreChange = {
  uid: string;
  email: string | null;
  /** What is stored now, as an ISO string (or null when missing). */
  from: string | null;
  /** Auth's creation time. */
  to: string;
  /** How the new value is written: the same type as the stored one, so no document changes type. */
  as: "timestamp" | "number";
  reason: "reset_by_login" | "missing";
};

export type RestorePlan = {
  changes: RestoreChange[];
  unchanged: number;
  /** Profiles whose account no longer exists in Firebase Auth: nothing to restore from. */
  noAuthAccount: string[];
};

export const toMs = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && typeof (v as { toMillis?: unknown }).toMillis === "function") return (v as Timestamp).toMillis();
  return null;
};

/** Pure: decides what would change. Writes nothing. */
export function planRestore(
  profiles: { uid: string; email?: string | null; createdAt: StoredCreatedAt }[],
  authUsers: AuthRecord[],
): RestorePlan {
  const auth = new Map(authUsers.map((a) => [a.uid, a.creationMs]));
  const plan: RestorePlan = { changes: [], unchanged: 0, noAuthAccount: [] };
  for (const p of profiles) {
    const real = auth.get(p.uid);
    if (real === undefined || !Number.isFinite(real)) {
      plan.noAuthAccount.push(p.uid);
      continue;
    }
    const stored = toMs(p.createdAt);
    const as = typeof p.createdAt === "number" ? "number" : "timestamp";
    if (stored === null) {
      plan.changes.push({ uid: p.uid, email: p.email ?? null, from: null, to: new Date(real).toISOString(), as, reason: "missing" });
    } else if (stored > real + TOLERANCE_MS) {
      plan.changes.push({ uid: p.uid, email: p.email ?? null, from: new Date(stored).toISOString(), to: new Date(real).toISOString(), as, reason: "reset_by_login" });
    } else {
      plan.unchanged++;
    }
  }
  return plan;
}

/** Reads every profile (only the fields needed). */
export async function readProfiles(db: Firestore) {
  const snap = await db.collection("users").select("email", "createdAt").get();
  return snap.docs.map((d) => ({ uid: d.id, email: (d.get("email") as string | undefined) ?? null, createdAt: d.get("createdAt") as StoredCreatedAt }));
}

/**
 * Writes the planned changes: one field per document, in batches. Re-running is harmless (an already restored date is no longer
 * later than Auth's by more than a day, so it is not planned again). Returns how many documents were written.
 */
export async function applyRestore(db: Firestore, changes: RestoreChange[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < changes.length; i += 400) {
    const batch = db.batch();
    for (const c of changes.slice(i, i + 400)) {
      const ms = Date.parse(c.to);
      batch.update(db.collection("users").doc(c.uid), { createdAt: c.as === "number" ? ms : Timestamp.fromMillis(ms) });
    }
    await batch.commit();
    written += Math.min(400, changes.length - i);
  }
  return written;
}
