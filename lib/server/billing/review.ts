import type { Firestore } from "firebase-admin/firestore";
import { APP_URL } from "@/lib/branding";
import { notifyAdmin } from "@/lib/server/notify/admin";
import type { Logger } from "@/lib/server/log";

/**
 * Items an operator has to look at (S2-16): Stripe events that ended in `needs_review` (unmatched payment, partial refund,
 * refund for an unknown payment, ...) and payments flagged `needsReview` (open dispute, legacy payment revoked, ...).
 * An item stays "open" until someone marks it reviewed, which is also what stops it from appearing in the daily digest.
 */

export type ReviewEvent = { id: string; type: string; outcome: string; sessionId: string | null; uid: string | null; receivedAt: number; error: string | null };
export type ReviewPayment = {
  id: string; uid: string | null; status: string; reviewNote: string | null; activatedAt: number; amountTotal: number | null; currency: string | null;
};

const num = (v: unknown, d = 0) => (typeof v === "number" ? v : d);
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

export async function listOpenReviewItems(db: Firestore): Promise<{ events: ReviewEvent[]; payments: ReviewPayment[] }> {
  const [eventsSnap, paymentsSnap] = await Promise.all([
    db.collection("stripe_events").where("status", "==", "needs_review").get(),
    db.collection("payments").where("needsReview", "==", true).get(),
  ]);
  const events = eventsSnap.docs
    .filter((d) => !d.data().resolvedAt)
    .map((d) => {
      const x = d.data();
      return { id: d.id, type: str(x.type) ?? "", outcome: str(x.outcome) ?? "needs_review", sessionId: str(x.sessionId), uid: str(x.uid), receivedAt: num(x.receivedAt), error: str(x.error) };
    })
    .sort((a, b) => a.receivedAt - b.receivedAt);
  const payments = paymentsSnap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id, uid: str(x.uid), status: str(x.status) ?? "fulfilled", reviewNote: str(x.reviewNote), activatedAt: num(x.activatedAt),
        amountTotal: typeof x.amountTotal === "number" ? x.amountTotal : null, currency: str(x.currency),
      };
    })
    .sort((a, b) => a.activatedAt - b.activatedAt);
  return { events, payments };
}

export type ReviewResult = "reviewed" | "not_found" | "not_open";

/** Mark an item reviewed. For an event this records who and when; for a payment it also clears its `needsReview` flag. */
export async function markReviewed(
  db: Firestore,
  { kind, id, by, note, now = Date.now() }: { kind: "event" | "payment"; id: string; by: string; note?: string; now?: number },
): Promise<ReviewResult> {
  const ref = db.collection(kind === "event" ? "stripe_events" : "payments").doc(id);
  return db.runTransaction(async (tx): Promise<ReviewResult> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return "not_found";
    const d = snap.data()!;
    const open = kind === "event" ? d.status === "needs_review" && !d.resolvedAt : d.needsReview === true;
    if (!open) return "not_open";
    const record = { reviewedBy: by, reviewedAt: now, ...(note ? { reviewOutcomeNote: note.slice(0, 500) } : {}) };
    tx.update(ref, kind === "event" ? { resolvedAt: now, resolvedBy: by, ...(note ? { resolutionNote: note.slice(0, 500) } : {}) } : { needsReview: false, ...record });
    return "reviewed";
  });
}

// ---------------------------------------------------------------------------------------------
// Daily digest
// ---------------------------------------------------------------------------------------------

const STATE = ["system_state", "needs-review-digest"] as const;
export const DIGEST_MIN_GAP_MS = 20 * 60 * 60 * 1000;
const MAX_LISTED = 25;

export type DigestResult = "sent" | "nothing_to_report" | "skipped_recent" | "mail_failed" | "mail_not_configured";

const ageDays = (ms: number, now: number) => Math.max(0, Math.floor((now - ms) / 86_400_000));

/**
 * E-mails the operator one summary of everything still open, at most once every 20 hours, and only when there is something to
 * report. If the mail cannot be sent the "last sent" time is not updated, so the next run tries again.
 */
export async function sendReviewDigest(
  db: Firestore,
  log: Logger,
  { now = Date.now() }: { now?: number } = {},
): Promise<DigestResult> {
  const stateRef = db.collection(STATE[0]).doc(STATE[1]);
  const last = ((await stateRef.get()).data()?.lastSentAt as number | undefined) ?? 0;
  if (now - last < DIGEST_MIN_GAP_MS) return "skipped_recent";

  const { events, payments } = await listOpenReviewItems(db);
  const total = events.length + payments.length;
  if (total === 0) return "nothing_to_report";

  const lines = [
    `${total} payment item${total === 1 ? "" : "s"} still need${total === 1 ? "s" : ""} a human look (${events.length} Stripe event${events.length === 1 ? "" : "s"}, ${payments.length} payment${payments.length === 1 ? "" : "s"}). Oldest first.`,
    "",
    ...events.slice(0, MAX_LISTED).map((e) => `- Event ${e.id}: ${e.outcome} (${e.type}), ${ageDays(e.receivedAt, now)} day(s) old${e.sessionId ? `, session ${e.sessionId}` : ""}${e.error ? `, ${e.error}` : ""}`),
    ...payments.slice(0, MAX_LISTED).map((p) => `- Payment ${p.id}: ${p.status}${p.reviewNote ? `, ${p.reviewNote}` : ""}, ${ageDays(p.activatedAt, now)} day(s) old`),
    ...(events.length > MAX_LISTED || payments.length > MAX_LISTED ? ["- ...and more"] : []),
    "",
    `See the customer under Admin > Users (${APP_URL.replace(/\/$/, "")}/dashboard/admin/users), then mark each item reviewed: it will not appear in tomorrow's digest.`,
    "Items stay in this digest until they are marked reviewed.",
  ];
  const result = await notifyAdmin({ subject: `${total} payment item${total === 1 ? "" : "s"} need review`, lines }, log);
  if (result === "sent") {
    await stateRef.set({ lastSentAt: now, events: events.length, payments: payments.length });
    return "sent";
  }
  return result === "skipped" ? "mail_not_configured" : "mail_failed";
}
