/**
 * Sends one test e-mail through the app's own mail settings, so you can confirm SMTP works
 * (operator alerts and customer notices use exactly this path):
 *
 *   npx tsx --env-file=.env.local scripts/ops/send-test-email.ts              # to ADMIN_ALERT_EMAIL
 *   npx tsx --env-file=.env.local scripts/ops/send-test-email.ts you@example.com
 *
 * Prints which settings are present (names only, never values).
 */
import { sendEmail } from "@/lib/email";

const NEEDED = ["CONTACT_SMTP_HOST", "CONTACT_SMTP_USER", "CONTACT_SMTP_PASS"] as const;

async function main() {
  const to = process.argv[2] ?? process.env.ADMIN_ALERT_EMAIL?.trim();
  if (!to) {
    console.error("No recipient: pass an address or set ADMIN_ALERT_EMAIL.");
    process.exit(1);
  }
  if (process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY is set, so Resend is tried first; unset it to use SMTP only (decision D17).");
  }
  const missing = NEEDED.filter((k) => !process.env[k]);
  console.log(`SMTP settings: ${NEEDED.map((k) => `${k}=${process.env[k] ? "set" : "MISSING"}`).join(", ")}`);
  console.log(`Port ${process.env.CONTACT_SMTP_PORT || 587}, secure=${process.env.CONTACT_SMTP_SECURE === "true"}`);
  if (missing.length) {
    console.error(`Cannot send: ${missing.join(", ")} not set.`);
    process.exit(1);
  }

  const when = new Date().toISOString();
  const ok = await sendEmail({
    to,
    subject: "[PhotoDrive] Test e-mail",
    text: `This is a test e-mail from PhotoDrive, sent ${when}.\nIf you can read it, SMTP is working.`,
    html: `<p>This is a test e-mail from PhotoDrive, sent ${when}.</p><p>If you can read it, SMTP is working.</p>`,
  });
  console.log(ok ? `Sent to ${to}. Check the inbox (and spam).` : "FAILED: see the error above.");
  process.exit(ok ? 0 : 1);
}

void main();
