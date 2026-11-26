import "server-only";
// Server-only helper (import from API routes only — never from client code).

/**
 * Minimal transactional-email sender. Uses the same configuration as the
 * contact form (see .env.example): Resend if RESEND_API_KEY is set, otherwise
 * SMTP if CONTACT_SMTP_* is set. Returns false — never throws — when nothing
 * is configured or delivery fails, so callers can treat email as best-effort.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<boolean> {
  const from = process.env.CONTACT_FROM_EMAIL || "PhotoDrive <no-reply@photodrive.co>";

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [opts.to],
          subject: opts.subject,
          html: opts.html,
          text: opts.text,
          ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        }),
      });
      if (res.ok) return true;
    } catch {
      // fall through to SMTP
    }
  }

  const host = process.env.CONTACT_SMTP_HOST;
  const user = process.env.CONTACT_SMTP_USER;
  const pass = process.env.CONTACT_SMTP_PASS;
  if (host && user && pass) {
    try {
      const { default: nodemailer } = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.CONTACT_SMTP_PORT || 587),
        secure: process.env.CONTACT_SMTP_SECURE === "true",
        auth: { user, pass },
        // Callers (e.g. the Stripe webhook sending an operator alert) are waiting on this:
        // fail fast instead of nodemailer's default of about two minutes.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
      await transporter.sendMail({
        from: process.env.CONTACT_FROM_EMAIL || `PhotoDrive <${user}>`,
        to: opts.to,
        replyTo: opts.replyTo,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      });
      return true;
    } catch (err) {
      console.error("sendEmail SMTP failed:", err);
    }
  }
  return false;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
