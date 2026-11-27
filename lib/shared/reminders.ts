import { DAY_MS, isLifetime } from "@/lib/shared/billing-access";

/**
 * Renewal reminders: who is due which e-mail, right now (S9-03). Pure: no I/O and no clock (callers pass `now`).
 *
 * Three messages per plan period, each at most once, keyed by the expiry date so a renewal (a new expiry) starts afresh:
 *  - `expiring14`: the plan ends in 14 days or less (but more than 3);
 *  - `expiring3`:  the plan ends in 3 days or less;
 *  - `lapsed`:     the plan ended in the last 3 days (a notice, not a chase: an account that lapsed long ago is never mailed).
 * Only the most urgent applicable message is due, so a missed run never sends two at once. Lifetime accounts, accounts an
 * administrator granted by hand (comped), and accounts with no recorded expiry get nothing.
 */
export type ReminderKind = "expiring14" | "expiring3" | "lapsed";
export const REMINDER_KINDS: readonly ReminderKind[] = ["expiring14", "expiring3", "lapsed"];

export const FIRST_REMINDER_DAYS = 14;
export const FINAL_REMINDER_DAYS = 3;
/** How long after the end date the "plan has ended" notice may still be sent (covers a few missed daily runs). */
export const LAPSED_NOTICE_DAYS = 3;

export type ReminderUser = {
  subscriptionExpiresAt?: unknown;
  compGranted?: unknown;
  remindersSent?: Record<string, unknown> | null;
};

const validTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** The key a sent reminder is recorded under: the kind and the UTC day the plan ends, so renewing resets everything. */
export const reminderKey = (kind: ReminderKind, expiresAt: number) => `${kind}:${new Date(expiresAt).toISOString().slice(0, 10)}`;

/** Which message the plan's timing calls for, ignoring whether it was already sent. */
export function reminderKindFor(expiresAt: number, now: number): ReminderKind | null {
  const left = expiresAt - now;
  if (left > FIRST_REMINDER_DAYS * DAY_MS) return null;
  if (left > FINAL_REMINDER_DAYS * DAY_MS) return "expiring14";
  if (left > 0) return "expiring3";
  return -left <= LAPSED_NOTICE_DAYS * DAY_MS ? "lapsed" : null;
}

/** The reminder this user is due now, or null: nothing applies, the account is excluded, or that message was already sent. */
export function dueReminder(user: ReminderUser, now: number): ReminderKind | null {
  const exp = user.subscriptionExpiresAt;
  if (!validTime(exp) || isLifetime(exp) || user.compGranted === true) return null;
  const kind = reminderKindFor(exp, now);
  if (!kind) return null;
  return user.remindersSent && user.remindersSent[reminderKey(kind, exp)] ? null : kind;
}

/** The range of expiry times that can be due now, for the database query: from the end of the lapsed window to the first reminder. */
export const dueWindow = (now: number) => ({ from: now - LAPSED_NOTICE_DAYS * DAY_MS, to: now + FIRST_REMINDER_DAYS * DAY_MS });
