import type { Firestore } from "firebase-admin/firestore";
import { computeExpiry } from "./access";

/**
 * Admin-side counterpart of fulfilCheckoutSession: adds `grantedMs` of access to a user with the
 * same `computeExpiry` rule (stacking, lifetime untouched), inside a transaction so it cannot lose
 * an update racing with a purchase. Returns the new expiry.
 */
export async function extendUserAccess(
  db: Firestore,
  uid: string,
  { grantedMs, fields = {}, now = Date.now() }: { grantedMs: number; fields?: Record<string, unknown>; now?: number },
): Promise<number> {
  const ref = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const expiresAt = computeExpiry({
      now,
      currentExpiresAt: snap.data()?.subscriptionExpiresAt as number | undefined,
      grantedMs,
    });
    tx.set(
      ref,
      { subscriptionStatus: "active", subscriptionExpiresAt: expiresAt, compGranted: true, ...fields },
      { merge: true },
    );
    return expiresAt;
  });
}
