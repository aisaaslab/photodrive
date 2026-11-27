import "server-only";
import { FieldPath, FieldValue, type Firestore } from "firebase-admin/firestore";
import { APP_NAME, APP_URL } from "@/lib/branding";
import { sendEmail } from "@/lib/email";
import { LOCALES } from "@/lib/i18n/languages";
import { getSupportEmail } from "@/lib/site-settings";
import { GRACE_DAYS, GRACE_MS } from "@/lib/gallery/availability";
import { dueReminder, dueWindow, reminderKey, type ReminderKind } from "@/lib/shared/reminders";
import { billingFulfilV2 } from "@/lib/server/billing/flags";
import { lapseEnforced } from "@/lib/server/gallery-availability";
import { renderReminder } from "@/lib/server/notify/reminder-templates";
import { userLanguage } from "@/lib/server/user-language";
import type { Logger } from "@/lib/server/log";
import { usersCol } from "@/lib/server/repos/collections";

/**
 * The daily renewal-reminder job (S9-03). Finds customers whose plan ends within 14 days, ends within 3 days, or ended in the last 3
 * days, and e-mails each the one message they are due, in their own language, at most once per plan period (recorded under
 * `users.remindersSent`, keyed by kind and expiry date: see lib/shared/reminders.ts for the rules).
 *
 * These are real e-mails to real customers, so the job has three modes (env `REMINDERS_MODE`): `off` (the default: does nothing),
 * `dry-run` (works out who would get what and reports it, masked, without sending or recording anything) and `send`.
 */
export type ReminderMode = "off" | "dry-run" | "send";
export const reminderMode = (): ReminderMode => {
  const v = process.env.REMINDERS_MODE?.trim().toLowerCase();
  return v === "send" || v === "dry-run" ? v : "off";
};

/** Most e-mails one run sends; whatever is left is still due tomorrow (the windows are days wide). */
export const MAX_SENDS_PER_RUN = 200;
const PAGE = 400;

export type PlannedReminder = { uid: string; kind: ReminderKind; lang: string; to: string; expiresAt: string };
export type ReminderRun = {
  mode: ReminderMode;
  scanned: number;
  due: number;
  sent: number;
  failed: number;
  skippedNoEmail: number;
  /** Expiring reminders held back because early renewal is not switched on (the renew link would not work). */
  heldBackNoEarlyRenewal: number;
  /** Due but not sent this run because the per-run limit was reached. */
  deferred: number;
  planned: PlannedReminder[];
};

/** "maria@example.com" → "m***@example.com", so a report can be reviewed without exposing addresses. */
export const maskEmail = (email: string) => {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
};

export async function runReminders(opts: {
  db: Firestore;
  mode: ReminderMode;
  log: Logger;
  now?: number;
  /** Injected in tests. */
  send?: typeof sendEmail;
  maxSends?: number;
  /** Whether purchases made while active extend the plan (BILLING_FULFIL_V2). Injected in tests. */
  earlyRenewal?: boolean;
}): Promise<ReminderRun> {
  const { db, mode, log } = opts;
  const now = opts.now ?? Date.now();
  const send = opts.send ?? sendEmail;
  const maxSends = opts.maxSends ?? MAX_SENDS_PER_RUN;
  const earlyRenewal = opts.earlyRenewal ?? billingFulfilV2();
  const run: ReminderRun = { mode, scanned: 0, due: 0, sent: 0, failed: 0, skippedNoEmail: 0, heldBackNoEarlyRenewal: 0, deferred: 0, planned: [] };
  if (mode === "off") return run;

  const enforced = lapseEnforced();
  const support = await getSupportEmail();
  const base = APP_URL.replace(/\/$/, "");
  const { from, to } = dueWindow(now);

  let after: unknown = undefined;
  for (;;) {
    let q = usersCol(db).where("subscriptionExpiresAt", ">", from).where("subscriptionExpiresAt", "<=", to).orderBy("subscriptionExpiresAt").limit(PAGE);
    if (after !== undefined) q = q.startAfter(after);
    const snap = await q.get();
    if (snap.empty) break;
    after = snap.docs[snap.docs.length - 1].get("subscriptionExpiresAt");

    for (const doc of snap.docs) {
      run.scanned++;
      const user = doc.data();
      const kind = dueReminder(user, now);
      if (!kind) continue;
      const email = typeof user.email === "string" ? user.email.trim() : "";
      if (!email) { run.skippedNoEmail++; continue; }
      if (kind !== "lapsed" && !earlyRenewal) { run.heldBackNoEarlyRenewal++; continue; }
      run.due++;
      const lang = userLanguage(user);
      const expiresAt = user.subscriptionExpiresAt as number;
      run.planned.push({ uid: doc.id, kind, lang, to: maskEmail(email), expiresAt: new Date(expiresAt).toISOString().slice(0, 10) });
      if (mode === "dry-run") continue;
      if (run.sent + run.failed >= maxSends) { run.deferred++; continue; }

      // Claim this reminder before sending, in a transaction that re-checks it against the current document, so two runs at
      // once (or a retry) can never send it twice. A send that fails gives the claim back, so tomorrow's run tries again.
      const key = reminderKey(kind, expiresAt);
      const claimed = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if (dueReminder(fresh.data() ?? {}, now) !== kind) return false;
        tx.set(doc.ref, { remindersSent: { [key]: now } }, { merge: true });
        return true;
      });
      if (!claimed) { run.due--; run.planned.pop(); continue; }

      try {
        const locale = LOCALES[lang];
        const date = (ms: number) => new Date(ms).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
        const rendered = renderReminder(kind, lang, {
          name: typeof user.name === "string" ? (user.name.trim().split(/\s+/)[0] ?? "") : "",
          appName: APP_NAME, date: date(expiresAt), graceEnd: date(expiresAt + GRACE_MS), graceDays: GRACE_DAYS,
          lapseEnforced: enforced, supportEmail: support, url: `${base}/subscribe`,
        });
        const ok = await send({ to: email, subject: rendered.subject, html: rendered.html, text: rendered.text, replyTo: support });
        if (!ok) throw new Error("send returned false");
        run.sent++;
      } catch (err) {
        run.failed++;
        log.error("renewal reminder could not be sent", { uid: doc.id, kind, err: String(err) });
        await doc.ref.update(new FieldPath("remindersSent", key), FieldValue.delete()).catch(() => {});
      }
    }
    if (snap.docs.length < PAGE) break;
  }
  return run;
}
