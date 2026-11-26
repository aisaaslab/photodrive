import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { APP_NAME, APP_URL } from "@/lib/branding";
import { sendEmail } from "@/lib/email";
import { LOCALES, type Lang } from "@/lib/i18n/languages";
import { getSupportEmail } from "@/lib/site-settings";
import { isLifetime } from "@/lib/shared/billing-access";
import { formatMoney } from "@/lib/shared/money";
import { userLanguage } from "@/lib/server/user-language";
import type { Logger } from "@/lib/server/log";
import { renderNotice, type NoticeKind } from "./templates";
import { customerNoticesCol, usersCol } from "@/lib/server/repos/collections";

/**
 * Customer e-mails about payment events (S2-14, D17).
 *
 * Best-effort side effects: this never throws and a failure never changes a webhook response. Each message is sent at most
 * once per (kind, reference): a record in `customer_notices` is created first, and a message already marked sent is never sent
 * again, even if the Stripe event is redelivered or a second event covers the same payment. A message that failed to send
 * is tried again if the event is retried.
 */

export type NoticeInput = {
  kind: NoticeKind;
  /** The payment (checkout session) id the message is about; with `kind` it identifies the message. */
  refId: string;
  uid: string;
  /** Minor units, as Stripe reports them. */
  amountMinor?: number | null;
  refundedMinor?: number | null;
  currency?: string | null;
};

export type NoticeResult = "sent" | "skipped_duplicate" | "skipped_no_email" | "skipped_no_user" | "failed";

/** A claim younger than this is assumed to be a call that is still sending; older means it crashed. */
const PENDING_MS = 2 * 60 * 1000;

export async function sendCustomerNotice(
  db: Firestore,
  input: NoticeInput,
  log: Logger,
  now: number = Date.now(),
): Promise<NoticeResult> {
  const id = `${input.kind}__${input.refId}`;
  try {
    const userSnap = await usersCol(db).doc(input.uid).get();
    if (!userSnap.exists) return "skipped_no_user";
    const user = userSnap.data()!;
    const to = typeof user.email === "string" ? user.email.trim() : "";
    if (!to) {
      log.warn("customer notice skipped: the user has no e-mail address", { kind: input.kind, uid: input.uid });
      return "skipped_no_email";
    }

    // Claim the message. Already sent: stop. Being sent right now by another call (a recent "pending" claim): stop, or the
    // customer would get it twice. Failed earlier, or a "pending" claim old enough to be a crashed attempt: try again.
    const ref = customerNoticesCol(db).doc(id);
    const claim = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prior = snap.data();
      if (prior?.status === "sent") return null;
      if (prior?.status === "pending" && now - ((prior.updatedAt as number | undefined) ?? 0) < PENDING_MS) return null;
      const attempts = ((prior?.attempts as number | undefined) ?? 0) + 1;
      tx.set(ref, { kind: input.kind, refId: input.refId, uid: input.uid, status: "pending", attempts, updatedAt: now }, { merge: true });
      return attempts;
    });
    if (claim === null) return "skipped_duplicate";

    const lang: Lang = userLanguage(user);
    const locale = LOCALES[lang];
    const currency = input.currency ?? "usd";
    const expiry = typeof user.subscriptionExpiresAt === "number" ? user.subscriptionExpiresAt : 0;
    const hasAccess = user.subscriptionStatus === "active" && expiry > now;

    const rendered = renderNotice(input.kind, lang, {
      name: typeof user.name === "string" ? user.name.trim().split(/\s+/)[0] ?? "" : "",
      appName: APP_NAME,
      amount: typeof input.amountMinor === "number" ? formatMoney(input.amountMinor, currency, locale) : "",
      refunded: typeof input.refundedMinor === "number" ? formatMoney(input.refundedMinor, currency, locale) : undefined,
      lifetime: hasAccess && isLifetime(expiry),
      accessEnds: hasAccess && !isLifetime(expiry)
        ? new Date(expiry).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
        : null,
      supportEmail: await getSupportEmail(),
      url: `${APP_URL.replace(/\/$/, "")}/subscribe`,
    });

    const ok = await sendEmail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text, replyTo: await getSupportEmail() });
    await ref.set(ok ? { status: "sent", sentAt: now, language: lang, updatedAt: now } : { status: "failed", updatedAt: now }, { merge: true });
    if (!ok) log.error("customer notice could not be sent", { kind: input.kind, refId: input.refId, uid: input.uid });
    return ok ? "sent" : "failed";
  } catch (err) {
    log.error("customer notice failed", { kind: input.kind, refId: input.refId, uid: input.uid, err });
    return "failed";
  }
}
