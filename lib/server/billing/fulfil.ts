import type Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { stripe, isSessionSettled } from "@/lib/stripe/server";
import { resolveAccessDays } from "@/lib/promo-codes";
import type { FulfilSource, PaymentDoc, PlanInterval } from "@/lib/firestore/types";
import { DAY_MS, computeExpiry, periodMs } from "./access";

export type FulfilResult =
  /** Money not collected yet (async method still processing, unpaid, expired). No access change. */
  | { state: "pending"; sessionId: string }
  /** This call granted access. */
  | { state: "fulfilled"; sessionId: string; uid: string; grantedMs: number; expiresAt: number }
  /** An earlier call already fulfilled this session; nothing changed. */
  | { state: "already_fulfilled"; sessionId: string; uid: string; expiresAt: number | null };

/** A settled payment whose user could not be identified. Callers decide whether to retry or flag it. */
export class UnmatchedPayment extends Error {
  constructor(public readonly sessionId: string) {
    super(`Settled checkout session ${sessionId} could not be matched to a user`);
    this.name = "UnmatchedPayment";
  }
}

export type FulfilOptions = {
  source: FulfilSource;
  /** Clock override for tests. */
  now?: () => number;
};

/**
 * Best-effort: the promotion code a $0 checkout used, and the optional
 * `access_days` metadata set on the code/coupon in Stripe. Never throws.
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

/** metadata.uid → client_reference_id → the customer's e-mail address. */
async function resolveUid(session: Stripe.Checkout.Session): Promise<string | null> {
  const direct = session.metadata?.uid || session.client_reference_id;
  if (direct) return direct;
  const email = session.customer_details?.email ?? session.customer_email;
  if (!email) return null;
  try {
    return (await getAdminAuth().getUserByEmail(email)).uid;
  } catch {
    return null;
  }
}

const idOf = (v: string | { id: string } | null | undefined): string | null =>
  typeof v === "string" ? v : (v?.id ?? null);

/**
 * The single place that turns a paid Checkout Session into access time.
 *
 * Idempotent and safe to race: the `payments/{sessionId}` document is the
 * idempotency key and is created inside the same transaction that moves the
 * user's expiry, so the webhook, the verify route and reconciliation can all
 * call it for the same session and exactly one of them grants time.
 *
 * Time is stacked with `computeExpiry`: buying while active extends from the
 * current expiry; buying after expiry starts from now.
 *
 * @throws UnmatchedPayment when the session is settled but no user can be found.
 */
export async function fulfilCheckoutSession(
  sessionOrId: Stripe.Checkout.Session | string,
  { source, now = Date.now }: FulfilOptions,
): Promise<FulfilResult> {
  const session =
    typeof sessionOrId === "string" ? await stripe.checkout.sessions.retrieve(sessionOrId) : sessionOrId;

  if (!isSessionSettled(session)) return { state: "pending", sessionId: session.id };

  const uid = await resolveUid(session);
  if (!uid) throw new UnmatchedPayment(session.id);

  const db = getAdminDb();
  const paymentRef = db.collection("payments").doc(session.id);
  const userRef = db.collection("users").doc(uid);

  const interval = (session.metadata?.interval as PlanInterval | undefined) ?? null;
  const planId = session.metadata?.planId || null;
  const amountTotal = session.amount_total ?? null;

  // Network and lookups happen before the transaction so none run inside it.
  const isFree = amountTotal === 0;
  const promo = isFree ? await lookupPromo(session.id) : null;
  const promoCode = promo?.code ?? null;
  // A free code's length is decided by the code (back office rule or `access_days`
  // on the Stripe code), not by the plan picked at checkout; no rule → plan period.
  const grant = isFree ? await resolveAccessDays(promoCode, promo?.metaDays) : null;
  const grantedMs = grant ? grant.days * DAY_MS : periodMs(interval);

  let planName: string | null = null;
  if (planId) {
    try {
      planName = ((await db.collection("plans").doc(planId).get()).data()?.name as string | undefined) ?? null;
    } catch {
      planName = null;
    }
  }

  const planFields = grant
    ? {
        // The plan's own name would mislead (e.g. "Monthly" for a year of access).
        planInterval: grant.days >= 180 ? "yearly" : "monthly",
        planName: promoCode ? `Free code · ${promoCode}` : "Free code",
        ...(planId ? { planId } : {}),
      }
    : planId
      ? { planId, planInterval: interval ?? "yearly", ...(planName ? { planName } : {}) }
      : {};

  const customerId = idOf(session.customer);

  return db.runTransaction(async (tx): Promise<FulfilResult> => {
    const [paymentSnap, userSnap] = await Promise.all([tx.get(paymentRef), tx.get(userRef)]);
    const currentExpiresAt = (userSnap.data()?.subscriptionExpiresAt as number | undefined) ?? null;

    // Any existing payment document, including pre-S1-03 ones with no status, means done.
    if (paymentSnap.exists) {
      const prior = paymentSnap.data() as Partial<PaymentDoc>;
      return {
        state: "already_fulfilled",
        sessionId: session.id,
        uid: prior.uid ?? uid,
        expiresAt: prior.expiresAtAfter ?? currentExpiresAt,
      };
    }

    const at = now();
    const expiresAt = computeExpiry({ now: at, currentExpiresAt, grantedMs });

    tx.set(
      userRef,
      {
        subscriptionStatus: "active",
        subscriptionExpiresAt: expiresAt,
        subscriptionSource: isFree ? "free_code" : "paid",
        // A paid purchase must not keep a stale free-code label.
        promoCode: promoCode ?? FieldValue.delete(),
        ...planFields,
        ...(customerId ? { stripeCustomerId: customerId } : {}),
      },
      { merge: true },
    );

    const payment: PaymentDoc = {
      uid,
      sessionId: session.id,
      amountTotal,
      currency: session.currency ?? null,
      customerId,
      planId,
      interval,
      source: isFree ? "free_code" : "paid",
      ...(promoCode ? { promoCode } : {}),
      ...(grant ? { accessDays: grant.days, accessDaysSource: grant.source } : {}),
      activatedAt: at,
      status: "fulfilled",
      grantedMs,
      expiresAtAfter: expiresAt,
      paymentIntentId: idOf(session.payment_intent as string | { id: string } | null),
      fulfilledBy: source,
      livemode: session.livemode ?? null,
    };
    tx.set(paymentRef, payment);

    return { state: "fulfilled", sessionId: session.id, uid, grantedMs, expiresAt };
  });
}
