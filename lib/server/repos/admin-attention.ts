import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { messageCounts } from "@/lib/server/repos/admin-messages";
import { paymentsCol, stripeEventsCol } from "@/lib/server/repos/collections";

/**
 * What needs an administrator right now (S8-04): payment items waiting for a person (Stripe events that ended in "needs review" and payments
 * flagged for review) and support messages nobody has opened. Live and cheap: three count queries and the few open Stripe events, so
 * it is never as stale as the cached overview numbers and can feed the tab badges as well as the Overview.
 */
export type AttentionCounts = {
  /** Payment events and flagged payments still open: the size of the queue on the Payments screen. */
  payments: number;
  /** Support messages nobody has opened yet. */
  supportUnread: number;
  /** Support messages not yet resolved (includes the unread ones). */
  supportOpen: number;
  total: number;
};

export async function attentionCounts(db: Firestore = getAdminDb()): Promise<AttentionCounts> {
  const [events, flagged, messages] = await Promise.all([
    // Only the field that says whether an event was dealt with is read; open events are few by design.
    stripeEventsCol(db).where("status", "==", "needs_review").select("resolvedAt").get(),
    paymentsCol(db).where("needsReview", "==", true).count().get(),
    messageCounts(db),
  ]);
  const openEvents = events.docs.filter((d) => !d.get("resolvedAt")).length;
  const payments = openEvents + flagged.data().count;
  return { payments, supportUnread: messages.unread, supportOpen: messages.open, total: payments + messages.unread };
}
