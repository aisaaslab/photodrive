import "server-only";
import type Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";
import { fulfilCheckoutSession, UnmatchedPayment } from "./fulfil";
import { isSessionSettled } from "./stripe";
import { notifyAdmin } from "@/lib/server/notify/admin";
import type { Logger } from "@/lib/server/log";
import { paymentsCol, systemStateDoc } from "@/lib/server/repos/collections";

export const RECONCILE_WINDOW_MS = 48 * 60 * 60 * 1000;
/** Consecutive runs that had to heal (or could not) before the operator is alerted. */
export const ALERT_AFTER_RUNS = 2;
const STATE_NAME = "reconcile-payments";
const MAX_PAGES = 20; // 2000 sessions in 48 h is far beyond this shop's volume

export type ReconcileSummary = {
  windowHours: number;
  /** Complete, settled checkout sessions of this app seen in the window. */
  checked: number;
  alreadyFulfilled: number;
  /** Sessions fulfilled by this run: money was taken but the webhook never got it through. */
  healed: number;
  /** Settled sessions whose user could not be found. */
  unmatched: number;
  errors: number;
  /** Complete sessions not yet settled (async payment still processing). */
  pending: number;
  /** Sessions with no uid marker: not created by this app, left alone. */
  skippedForeign: number;
  streak: number;
  alerted: boolean;
};

/**
 * Safety net for the webhook (S2-04). Lists Checkout Sessions from the last 48 h and fulfils any paid
 * session that has no `payments` document, through the same idempotent `fulfilCheckoutSession` the
 * webhook uses, so it can race with a late webhook without double-granting. Alerts the operator when
 * the job has had to heal (or failed to) on several runs in a row, which means the webhook is broken.
 */
export async function reconcilePayments({
  db,
  stripe,
  log,
  now = Date.now,
  windowMs = RECONCILE_WINDOW_MS,
}: {
  db: Firestore;
  stripe: Pick<Stripe, "checkout">;
  log: Logger;
  now?: () => number;
  windowMs?: number;
}): Promise<ReconcileSummary> {
  const since = Math.floor((now() - windowMs) / 1000);
  const s: ReconcileSummary = {
    windowHours: windowMs / 3_600_000,
    checked: 0, alreadyFulfilled: 0, healed: 0, unmatched: 0, errors: 0, pending: 0, skippedForeign: 0,
    streak: 0, alerted: false,
  };
  const problems: string[] = [];

  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await stripe.checkout.sessions.list({ created: { gte: since }, limit: 100, ...(after ? { starting_after: after } : {}) });
    for (const session of res.data) {
      if (session.status !== "complete") continue;
      if (!session.metadata?.uid && !session.client_reference_id) {
        s.skippedForeign++;
        continue;
      }
      if (!isSessionSettled(session)) {
        s.pending++;
        continue;
      }
      s.checked++;
      if ((await paymentsCol(db).doc(session.id).get()).exists) {
        s.alreadyFulfilled++;
        continue;
      }
      try {
        const r = await fulfilCheckoutSession(session, { source: "reconcile", now });
        if (r.state === "fulfilled") {
          s.healed++;
          problems.push(`healed ${session.id}`);
          log.error("reconcile healed a paid session the webhook missed", { sessionId: session.id, uid: r.uid });
        } else {
          s.alreadyFulfilled++; // a webhook finished it while we were looking
        }
      } catch (err) {
        if (err instanceof UnmatchedPayment) {
          s.unmatched++;
          problems.push(`unmatched ${session.id}`);
          log.error("reconcile: paid session cannot be matched to a user", { sessionId: session.id });
        } else {
          s.errors++;
          problems.push(`error ${session.id}`);
          log.error("reconcile: fulfilment failed", { sessionId: session.id, err });
        }
      }
    }
    if (!res.has_more || res.data.length === 0) break;
    after = res.data[res.data.length - 1].id;
  }

  // "Repeatedly > 0": one heal is normal (a webhook hiccup); the same on consecutive runs is not.
  const stateRef = systemStateDoc(STATE_NAME, db);
  const prior = (await stateRef.get()).data() as { streak?: number; alerted?: boolean } | undefined;
  const bad = problems.length > 0;
  const streak = bad ? (prior?.streak ?? 0) + 1 : 0;
  let alerted = bad ? (prior?.alerted ?? false) : false;
  if (bad && streak >= ALERT_AFTER_RUNS && !alerted) {
    const result = await notifyAdmin(
      {
        subject: `Payment reconciliation had to fix payments ${streak} runs in a row`,
        lines: [
          `The hourly reconciliation found paid Stripe sessions that were not in the app (healed: ${s.healed}, unmatched: ${s.unmatched}, errors: ${s.errors}).`,
          "This usually means the Stripe webhook is failing. Check Stripe > Developers > Webhooks > recent deliveries.",
          ...problems.slice(0, 10),
        ],
      },
      log,
    );
    alerted = result === "sent";
  }
  await stateRef.set({ lastRunAt: now(), streak, alerted, lastSummary: { healed: s.healed, unmatched: s.unmatched, errors: s.errors } });
  s.streak = streak;
  s.alerted = alerted;
  return s;
}
