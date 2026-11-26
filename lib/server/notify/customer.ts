import type { Firestore } from "firebase-admin/firestore";
import { APP_NAME, APP_URL } from "@/lib/branding";
import { sendEmail } from "@/lib/email";
import { LOCALES, type Lang } from "@/lib/i18n/languages";
import { getSupportEmail } from "@/lib/site-settings";
import { isLifetime } from "@/lib/server/billing/access";
import { formatMoney } from "@/lib/shared/money";
import { userLanguage } from "@/lib/server/user-language";
import type { Logger } from "@/lib/server/log";
import { renderNotice, type NoticeKind } from "./templates";

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

const COLLECTION = "customer_notices";

export async function sendCustomerNotice(
  db: Firestore,
  input: NoticeInput,
  log: Logger,
  now: number = Date.now(),
): Promise<NoticeResult> {
  const id = `${input.kind}__${input.refId}`;
  try {
    const userSnap = await db.collection("users").doc(input.uid).get();
    if (!userSnap.exists) return "skipped_no_user";
    const user = userSnap.data()!;
    const to = typeof user.email === "string" ? user.email.trim() : "";
    if (!to) {
      log.warn("customer notice skipped: the user has no e-mail address", { kind: input.kind, uid: input.uid });
      return "skipped_no_email";
    }

    // Claim the message. If it exists and was sent, stop; if it exists but failed earlier, try again.
    const ref = db.collection(COLLECTION).doc(id);
    const claim = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.data()?.status === "sent") return null;
      const attempts = ((snap.data()?.attempts as number | undefined) ?? 0) + 1;
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
