import { sendEmail } from "@/lib/email";
import type { Logger } from "@/lib/server/log";

export type AdminAlert = {
  /** Short subject line, without the product prefix. */
  subject: string;
  /** Plain facts, one per line. Never put card data or personal e-mail addresses here. */
  lines: string[];
  /** Link to the relevant Stripe dashboard page, if any. */
  link?: string;
};

export type AlertResult = "sent" | "skipped" | "failed";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Immediate operator alert (D17): an e-mail to ADMIN_ALERT_EMAIL. Best-effort and never throws, so
 * a mail problem can never change a webhook response. With no address configured it only logs.
 * The caller is responsible for sending each alert once (see the `alertedAt` marker on stripe_events).
 */
export async function notifyAdmin(alert: AdminAlert, log: Logger): Promise<AlertResult> {
  const to = process.env.ADMIN_ALERT_EMAIL?.trim();
  if (!to) {
    log.warn("operator alert not e-mailed: ADMIN_ALERT_EMAIL is not set", { subject: alert.subject });
    return "skipped";
  }
  try {
    const subject = `[PhotoDrive] ${alert.subject}`;
    const text = [...alert.lines, ...(alert.link ? ["", alert.link] : [])].join("\n");
    const html = `<p>${alert.lines.map(esc).join("<br>")}</p>${alert.link ? `<p><a href="${esc(alert.link)}">${esc(alert.link)}</a></p>` : ""}`;
    const ok = await sendEmail({ to, subject, text, html });
    if (!ok) log.error("operator alert e-mail could not be sent", { subject: alert.subject });
    return ok ? "sent" : "failed";
  } catch (err) {
    log.error("operator alert e-mail threw", { subject: alert.subject, err });
    return "failed";
  }
}
