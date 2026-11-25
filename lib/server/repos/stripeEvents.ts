import type { Firestore } from "firebase-admin/firestore";
import type { StripeEventDoc, StripeEventStatus } from "@/lib/firestore/types";

const COLLECTION = "stripe_events";

/** A "processing" claim older than this is treated as a crashed attempt and may be taken over. */
export const STALE_PROCESSING_MS = 5 * 60 * 1000;

export type ClaimResult =
  /** First delivery, or a retry of a failed / crashed one: go ahead and process. */
  | { claimed: true; attempts: number }
  /** Already finished (processed / ignored / needs_review): do nothing, answer 200. */
  | { claimed: false; reason: "duplicate"; status: StripeEventStatus }
  /** Another delivery of this event is being processed right now: answer non-2xx so Stripe retries. */
  | { claimed: false; reason: "in_flight" };

const ref = (db: Firestore, eventId: string) => db.collection(COLLECTION).doc(eventId);

/**
 * Create-if-absent on receipt. Safe to race: the decision is made in a transaction, so of several
 * simultaneous deliveries of one event exactly one is told to process it.
 */
export async function claimEvent(
  db: Firestore,
  event: { id: string; type: string; livemode: boolean },
  now: number = Date.now(),
): Promise<ClaimResult> {
  return db.runTransaction(async (tx): Promise<ClaimResult> => {
    const snap = await tx.get(ref(db, event.id));
    if (!snap.exists) {
      const doc: StripeEventDoc = {
        type: event.type,
        livemode: event.livemode,
        receivedAt: now,
        lastAttemptAt: now,
        attempts: 1,
        status: "processing",
      };
      tx.set(ref(db, event.id), doc);
      return { claimed: true, attempts: 1 };
    }

    const prior = snap.data() as StripeEventDoc;
    if (prior.status === "processed" || prior.status === "ignored" || prior.status === "needs_review") {
      return { claimed: false, reason: "duplicate", status: prior.status };
    }
    if (prior.status === "processing" && now - prior.lastAttemptAt < STALE_PROCESSING_MS) {
      return { claimed: false, reason: "in_flight" };
    }

    // failed (Stripe is retrying) or a stale "processing" claim: take it over.
    const attempts = (prior.attempts ?? 1) + 1;
    tx.update(ref(db, event.id), { status: "processing", lastAttemptAt: now, attempts, error: null });
    return { claimed: true, attempts };
  });
}

/** Remember that the operator alert for this event went out, so it is never sent twice. */
export async function markAlerted(db: Firestore, eventId: string, now: number = Date.now()): Promise<void> {
  await ref(db, eventId).set({ alertedAt: now }, { merge: true });
}

export async function markEvent(
  db: Firestore,
  eventId: string,
  status: Exclude<StripeEventStatus, "processing">,
  details: { sessionId?: string | null; uid?: string | null; outcome?: string; error?: string } = {},
  now: number = Date.now(),
): Promise<void> {
  const { sessionId, uid, outcome, error } = details;
  await ref(db, eventId).set(
    {
      status,
      processedAt: now,
      ...(sessionId ? { sessionId } : {}),
      ...(uid ? { uid } : {}),
      ...(outcome ? { outcome } : {}),
      // Never store more than a short message: no stack traces, no payloads.
      error: error ? error.slice(0, 300) : null,
    },
    { merge: true },
  );
}
