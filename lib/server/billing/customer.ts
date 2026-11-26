import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { appEnv } from "./flags";

/**
 * One Stripe Customer per user (S4-05, PAY-5). Checkout used to be given only `customer_email`, so every purchase left Stripe
 * with a separate guest record: no payment history per customer, no invoices tied to a person, and nothing to attach a saved
 * payment method or a later portal to. `ensureStripeCustomer` finds or creates the user's Customer once, remembers it on
 * `users/{uid}.stripeCustomerId`, and checkout passes it as `customer`.
 *
 * Never creates a duplicate:
 *  1. a stored id is reused if Stripe still has it (a customer that is gone or deleted is replaced);
 *  2. otherwise Stripe is searched by `metadata.uid`, which finds a customer created before the id was saved (a crash between
 *     the two steps, or another instance);
 *  3. otherwise one is created with an idempotency key per user (and per replaced id), so two simultaneous checkouts get the same
 *     customer back;
 *  4. the id is stored only if none was stored meanwhile (set-if-absent, in a transaction), and the stored one wins.
 * Customers made by earlier Checkout sessions have no `metadata.uid` and are deliberately not matched by e-mail address (two
 * people can share one); a user without a stored id simply gets a new Customer.
 */

type StripeLike = Pick<Stripe, "customers">;

const isMissing = (err: unknown) => (err as { code?: string; statusCode?: number })?.code === "resource_missing" || (err as { statusCode?: number })?.statusCode === 404;

async function stillExists(stripe: StripeLike, id: string, uid: string): Promise<boolean> {
  try {
    const c = await stripe.customers.retrieve(id);
    if ((c as Stripe.DeletedCustomer).deleted) return false;
    // An older customer saved before this existed: tag it, so a search by uid finds it from now on.
    if (!(c as Stripe.Customer).metadata?.uid) await stripe.customers.update(id, { metadata: { uid, env: appEnv() } }).catch(() => undefined);
    return true;
  } catch (err) {
    if (isMissing(err)) return false;
    throw err;
  }
}

async function findByUid(stripe: StripeLike, uid: string): Promise<string | null> {
  const found = await stripe.customers.search({ query: `metadata['uid']:'${uid.replace(/['\\]/g, "")}'`, limit: 2 });
  return found.data.find((c) => !(c as unknown as Stripe.DeletedCustomer).deleted)?.id ?? null;
}

/** Stores `id` unless another id was stored in the meantime (or replaces `replacing`, a stored id Stripe no longer knows). Returns the winner. */
async function remember(db: Firestore, uid: string, id: string, replacing: string | null): Promise<string> {
  const ref = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data()?.stripeCustomerId;
    if (typeof current === "string" && current && current !== replacing) return current;
    tx.set(ref, { stripeCustomerId: id }, { merge: true });
    return id;
  });
}

export async function ensureStripeCustomer(
  stripe: StripeLike,
  db: Firestore,
  user: { uid: string; email?: string | null; name?: string | null },
): Promise<string> {
  const { uid } = user;
  const stored = (await db.collection("users").doc(uid).get()).data()?.stripeCustomerId;
  const storedId = typeof stored === "string" && stored ? stored : null;
  if (storedId && (await stillExists(stripe, storedId, uid))) return storedId;

  const existing = await findByUid(stripe, uid);
  if (existing) return remember(db, uid, existing, storedId);

  const created = await stripe.customers.create(
    {
      ...(user.email ? { email: user.email } : {}),
      ...(user.name ? { name: user.name } : {}),
      metadata: { uid, env: appEnv() },
    },
    // The replaced id is part of the key: Stripe replays a key for 24 hours, which would otherwise hand back the customer we are replacing.
    { idempotencyKey: `customer:${appEnv()}:${uid}:${storedId ?? "new"}` },
  );
  return remember(db, uid, created.id, storedId);
}
