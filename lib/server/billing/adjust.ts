import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { PaymentDoc, PaymentStatus } from "@/lib/firestore/types";
import { DAY_MS, computeExpiry, periodMs, revokeGrant } from "@/lib/shared/billing-access";

/** The grant is in effect (as opposed to taken back). Payments before S1-03 have no status. */
const grantInEffect = (s: PaymentDoc["status"]) => s === undefined || s === "fulfilled" || s === "partially_refunded";

/**
 * Access time a payment granted. Payments written before S1-03 did not record it, so it is
 * derived from the plan period / free-code days (`legacy: true`): for those the real effect on the
 * user's expiry is uncertain (PAY-2), so the caller flags them for review.
 */
export function grantedMsOf(p: PaymentDoc): { ms: number; legacy: boolean } {
  if (typeof p.grantedMs === "number") return { ms: p.grantedMs, legacy: false };
  return { ms: p.accessDays ? p.accessDays * DAY_MS : periodMs(p.interval), legacy: true };
}

export type AdjustResult =
  | { result: "missing" }
  | { result: "noop"; status: PaymentDoc["status"] }
  | { result: "revoked" | "restored" | "status_only" | "flagged"; status: PaymentStatus; uid: string; legacy?: boolean };

type Ctx = { now: number };
const paymentRef = (db: Firestore, id: string) => db.collection("payments").doc(id);

/**
 * Take back a payment's grant (refund, dispute opened) and set its status. If the grant was
 * already taken back (e.g. dispute then refund) only the status changes, never a second revocation.
 */
export async function revokePayment(
  db: Firestore,
  paymentId: string,
  to: Extract<PaymentStatus, "refunded" | "disputed" | "dispute_lost">,
  { now }: Ctx,
  extra: Partial<PaymentDoc> = {},
): Promise<AdjustResult> {
  return db.runTransaction(async (tx): Promise<AdjustResult> => {
    const snap = await tx.get(paymentRef(db, paymentId));
    if (!snap.exists) return { result: "missing" };
    const pay = snap.data() as PaymentDoc;
    const userRef = db.collection("users").doc(pay.uid);
    const userSnap = await tx.get(userRef);

    if (pay.status === to || pay.status === "refunded" || (pay.status === "dispute_lost" && to !== "dispute_lost")) {
      return { result: "noop", status: pay.status };
    }

    if (!grantInEffect(pay.status)) {
      // Grant already taken back (disputed): only the label moves.
      tx.update(paymentRef(db, paymentId), { status: to, ...extra });
      return { result: "status_only", status: to, uid: pay.uid };
    }

    const { ms, legacy } = grantedMsOf(pay);
    const current = userSnap.data()?.subscriptionExpiresAt as number | undefined;
    const next = revokeGrant({ now, currentExpiresAt: current, grantedMs: ms });
    const revokedMs = Math.max(0, (current ?? 0) - next);

    if (userSnap.exists && next !== (current ?? 0)) {
      tx.set(
        userRef,
        { subscriptionExpiresAt: next, subscriptionStatus: next > now ? "active" : "expired" },
        { merge: true },
      );
    }
    tx.update(paymentRef(db, paymentId), {
      status: to,
      grantedMs: ms,
      revokedMs,
      revokedAt: now,
      // A disputed or legacy payment deserves a human look; a clean refund does not.
      needsReview: to === "disputed" || legacy,
      ...(legacy ? { reviewNote: "Granted time derived from the plan period (payment predates grantedMs); verify the user's expiry." } : {}),
      ...extra,
    });
    return { result: "revoked", status: to, uid: pay.uid, legacy };
  });
}

/** Dispute won: give back what the suspension took away, counted from now. */
export async function restorePayment(db: Firestore, paymentId: string, { now }: Ctx): Promise<AdjustResult> {
  return db.runTransaction(async (tx): Promise<AdjustResult> => {
    const snap = await tx.get(paymentRef(db, paymentId));
    if (!snap.exists) return { result: "missing" };
    const pay = snap.data() as PaymentDoc;
    if (pay.status !== "disputed") return { result: "noop", status: pay.status };

    const userRef = db.collection("users").doc(pay.uid);
    const userSnap = await tx.get(userRef);
    const current = userSnap.data()?.subscriptionExpiresAt as number | undefined;
    const expiresAt = computeExpiry({ now, currentExpiresAt: current, grantedMs: pay.revokedMs ?? 0 });
    if (userSnap.exists && expiresAt !== (current ?? 0)) {
      tx.set(userRef, { subscriptionExpiresAt: expiresAt, subscriptionStatus: expiresAt > now ? "active" : "expired" }, { merge: true });
    }
    tx.update(paymentRef(db, paymentId), { status: "fulfilled", needsReview: false, revokedMs: 0 });
    return { result: "restored", status: "fulfilled", uid: pay.uid };
  });
}

/** Partial refund: no access change (D5), but record it and ask for a review. */
export async function flagPartialRefund(db: Firestore, paymentId: string, refundedAmount: number): Promise<AdjustResult> {
  return db.runTransaction(async (tx): Promise<AdjustResult> => {
    const snap = await tx.get(paymentRef(db, paymentId));
    if (!snap.exists) return { result: "missing" };
    const pay = snap.data() as PaymentDoc;
    if (!grantInEffect(pay.status)) return { result: "noop", status: pay.status };
    tx.update(paymentRef(db, paymentId), {
      status: "partially_refunded",
      refundedAmount,
      needsReview: true,
      reviewNote: "Partial refund: access unchanged, decide whether to adjust it.",
    });
    return { result: "flagged", status: "partially_refunded", uid: pay.uid };
  });
}
