import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import type { PlanInterval } from "@/lib/firestore/types";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function periodMs(interval: PlanInterval | null | undefined): number {
  return interval === "monthly" ? MONTH_MS : YEAR_MS;
}

/**
 * Shared, idempotent subscription activator used by BOTH the Stripe webhook
 * and the /api/stripe/verify reconciliation route.
 *
 * Why idempotency matters: the same payment can be delivered more than once
 * (Stripe retries webhooks; the success page may re-verify an already-active
 * session). Without the guard below, each delivery would stack another
 * subscription period onto subscriptionExpiresAt.
 *
 * A `payments/{sessionId}` document is also written as the durable record of
 * the purchase — the account page reads it for payment confirmation.
 */
export async function activateSubscription(opts: {
  uid: string;
  sessionId: string | null;
  amountTotal?: number | null;
  currency?: string | null;
  stripeCustomerId?: string | null;
  // Plan context from the checkout session metadata. interval decides the
  // granted period; planId also snapshots name/interval onto the user doc.
  planId?: string | null;
  interval?: PlanInterval | null;
}) {
  const grantedMs = periodMs(opts.interval);
  const db = getAdminDb();
  const userRef = db.collection("users").doc(opts.uid);

  // Resolve plan details (name) for display; a deleted plan falls back to the
  // metadata interval only.
  let planName: string | null = null;
  if (opts.planId) {
    try {
      const snap = await db.collection("plans").doc(opts.planId).get();
      planName = (snap.data()?.name as string | undefined) ?? null;
    } catch {
      planName = null;
    }
  }
  const planFields = opts.planId
    ? {
        planId: opts.planId,
        planInterval: opts.interval ?? "yearly",
        ...(planName ? { planName } : {}),
      }
    : {};

  if (opts.sessionId) {
    const paymentRef = db.collection("payments").doc(opts.sessionId);
    // Transaction on the payment doc: it only exists once a delivery has
    // fully processed, so it doubles as the idempotency key.
    await db.runTransaction(async (tx) => {
      const paymentSnap = await tx.get(paymentRef);
      if (paymentSnap.exists) return;

      const userSnap = await tx.get(userRef);
      const now = Date.now();
      const currentExpires = (userSnap.data()?.subscriptionExpiresAt as number | undefined) ?? 0;
      const currentlyActive =
        userSnap.data()?.subscriptionStatus === "active" && currentExpires > now;

      // Only extend when not already active — replays must be no-ops.
      const expiresAt = currentlyActive ? currentExpires : now + grantedMs;

      tx.set(
        userRef,
        {
          subscriptionStatus: "active",
          subscriptionExpiresAt: expiresAt,
          ...planFields,
          ...(opts.stripeCustomerId ? { stripeCustomerId: opts.stripeCustomerId } : {}),
        },
        { merge: true }
      );
      tx.set(paymentRef, {
        uid: opts.uid,
        sessionId: opts.sessionId,
        amountTotal: opts.amountTotal ?? null,
        currency: opts.currency ?? null,
        customerId: opts.stripeCustomerId ?? null,
        planId: opts.planId ?? null,
        activatedAt: now,
      });
    });
    return;
  }

  // No session id (shouldn't happen in practice) — still guard against
  // re-extension for callers without one.
  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const now = Date.now();
    const currentExpires = (userSnap.data()?.subscriptionExpiresAt as number | undefined) ?? 0;
    const currentlyActive =
      userSnap.data()?.subscriptionStatus === "active" && currentExpires > now;
    if (!currentlyActive) {
      tx.set(
        userRef,
        {
          subscriptionStatus: "active",
          subscriptionExpiresAt: now + grantedMs,
          ...planFields,
          ...(opts.stripeCustomerId ? { stripeCustomerId: opts.stripeCustomerId } : {}),
        },
        { merge: true }
      );
    }
  });
}

/**
 * Resolves the Firebase uid for a completed Stripe Checkout session when
 * metadata.uid is missing (e.g. sessions created before metadata was added).
 * Falls back to looking the user up by the email on the session.
 */
export async function resolveUidForSession(session: {
  metadata?: Record<string, string | undefined> | null;
  customer_details?: { email?: string | null } | null;
  customer_email?: string | null;
}): Promise<string | null> {
  const uid = session.metadata?.uid;
  if (uid) return uid;

  const email = session.customer_details?.email ?? session.customer_email;
  if (!email) return null;

  try {
    const user = await getAdminAuth().getUserByEmail(email);
    return user.uid;
  } catch {
    return null;
  }
}
