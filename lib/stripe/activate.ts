import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import type { PlanInterval } from "@/lib/firestore/types";
import { stripe } from "@/lib/stripe/server";
import { resolveAccessDays } from "@/lib/promo-codes";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function periodMs(interval: PlanInterval | null | undefined): number {
  return interval === "monthly" ? MONTH_MS : YEAR_MS;
}

/**
 * Best-effort: the promotion code (e.g. "FREEYEAR") a checkout session used, so
 * the back office can show WHICH code someone signed up with, plus an optional
 * `access_days` metadata value set on the code/coupon in Stripe. Never throws;
 * returns nulls when Stripe can't be reached or no code was applied.
 */
async function lookupPromo(sessionId: string): Promise<{ code: string | null; metaDays: unknown }> {
  try {
    const s = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["total_details.breakdown.discounts.discount.promotion_code"],
    });
    const discount = s.total_details?.breakdown?.discounts?.[0]?.discount;
    const promo = discount?.promotion_code;
    const coupon = discount?.source?.coupon;
    const couponObj = coupon && typeof coupon === "object" ? coupon : null;
    if (promo && typeof promo === "object" && promo.code) {
      return { code: promo.code, metaDays: promo.metadata?.access_days ?? couponObj?.metadata?.access_days };
    }
    if (couponObj) return { code: couponObj.name ?? null, metaDays: couponObj.metadata?.access_days };
    return { code: null, metaDays: undefined };
  } catch {
    return { code: null, metaDays: undefined };
  }
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
  const db = getAdminDb();

  // A $0 checkout means a 100%-off code was used: remember that (and which
  // code), because Stripe-side it is just another "paid" session. Looked up
  // before the transaction so no network call happens inside it.
  const isFree = opts.amountTotal === 0;
  const promo = isFree && opts.sessionId ? await lookupPromo(opts.sessionId) : null;
  const promoCode = promo?.code ?? null;

  // How long a free code lasts is decided by the code (back-office rule, or
  // `access_days` on the Stripe code), not by whichever plan was picked at
  // checkout. No rule → previous behavior: the chosen plan's period.
  const grant = isFree ? await resolveAccessDays(promoCode, promo?.metaDays) : null;
  const grantedMs = grant ? grant.days * DAY_MS : periodMs(opts.interval);
  const sourceFields = {
    subscriptionSource: isFree ? "free_code" : "paid",
    ...(promoCode ? { promoCode } : {}),
  };
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
  const planFields = {
    ...(opts.planId ? { planId: opts.planId } : {}),
    ...(grant
      ? {
          // The plan's own name/interval would be misleading (e.g. "Monthly"
          // for a year of access), so label it by the code that granted it.
          planInterval: grant.days >= 180 ? "yearly" : "monthly",
          planName: promoCode ? `Free code · ${promoCode}` : "Free code",
        }
      : opts.planId
        ? { planInterval: opts.interval ?? "yearly", ...(planName ? { planName } : {}) }
        : {}),
  };

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
          // Only stamp the source when this delivery actually granted time —
          // a replay while already active must not relabel the account.
          ...(currentlyActive ? {} : sourceFields),
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
        // Plan period actually granted ("monthly" = 30 days, else 365) — lets
        // support see why an account got the length it did.
        interval: opts.interval ?? null,
        source: isFree ? "free_code" : "paid",
        ...(promoCode ? { promoCode } : {}),
        ...(grant ? { accessDays: grant.days, accessDaysSource: grant.source } : {}),
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
          ...sourceFields,
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
