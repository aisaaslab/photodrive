import "server-only";
import type { Firestore } from "firebase-admin/firestore";

/** A demo gallery works for 10 minutes. */
export const DEMO_LIFETIME_MS = 10 * 60 * 1000;

/** Demos are kept this long after they expire (so the visitor sees "expired", not a 404), then deleted. */
export const DEMO_GRACE_MS = 24 * 60 * 60 * 1000;
const BATCH = 400; // Firestore allows 500 writes per batch
const MAX_BATCHES = 25; // up to 10,000 deletions per run; the next run continues

/**
 * Deletes demo galleries that expired more than a day ago, in batches. Documents without a numeric `expiresAt` are left alone.
 * Safe to run repeatedly. Returns how many were deleted.
 */
export async function cleanupExpiredDemos(db: Firestore, now: number = Date.now()): Promise<number> {
  const cutoff = now - DEMO_GRACE_MS;
  let deleted = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const snap = await db.collection("demo_galleries").where("expiresAt", "<", cutoff).limit(BATCH).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < BATCH) break;
  }
  return deleted;
}
