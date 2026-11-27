import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupportEmail, type ContactMessageDoc } from "@/lib/site-settings";
import { clientIp, getRateLimiter, rateLimitHeaders } from "@/lib/server/rate-limit";
import { parseJson } from "@/lib/server/http";
import { ContactBody } from "@/lib/shared/schemas/public";
import { contactMessagesCol } from "@/lib/server/repos/collections";
import { APP_NAME, mailFrom } from "@/lib/branding";

export const runtime = "nodejs";

// At most 5 messages per 10 minutes per visitor, counted in the shared store (S3-06): the per-instance Map this
// replaced reset on every cold start and was not shared between serverless instances.
const MAX_PER_WINDOW = 5;
const WINDOW_SEC = 10 * 60;

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function forwardViaResend(opts: {
  to: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  message: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM_EMAIL || mailFrom(`${APP_NAME} Contact`);
  if (!apiKey) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        reply_to: `${opts.fromName} <${opts.fromEmail}>`,
        subject: `[Contact] ${opts.subject}`,
        html: `<p><strong>From:</strong> ${escapeHtml(opts.fromName)} &lt;${escapeHtml(opts.fromEmail)}&gt;</p><p><strong>Subject:</strong> ${escapeHtml(opts.subject)}</p><hr/><p>${escapeHtml(opts.message).replace(/\n/g, "<br/>")}</p>`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function forwardViaSmtp(opts: {
  to: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  message: string;
}): Promise<boolean> {
  const host = process.env.CONTACT_SMTP_HOST;
  const user = process.env.CONTACT_SMTP_USER;
  const pass = process.env.CONTACT_SMTP_PASS;
  if (!host || !user || !pass) return false;
  try {
    const { default: nodemailer } = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.CONTACT_SMTP_PORT || 587),
      secure: process.env.CONTACT_SMTP_SECURE === "true",
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: process.env.CONTACT_FROM_EMAIL || `PhotoDrive Contact <${user}>`,
      to: opts.to,
      replyTo: `${opts.fromName} <${opts.fromEmail}>`,
      subject: `[Contact] ${opts.subject}`,
      text: `From: ${opts.fromName} <${opts.fromEmail}>\nSubject: ${opts.subject}\n\n${opts.message}`,
    });
    return true;
  } catch (err) {
    console.error("Contact SMTP forward failed:", err);
    return false;
  }
}

/**
 * Public contact-form submission. Stores the message in Firestore
 * (`contactMessages`, readable in the admin back office) and forwards it
 * to the configured support email via Resend or SMTP when configured.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = await getRateLimiter().limit({ name: "contact", id: ip, limit: MAX_PER_WINDOW, windowSec: WINDOW_SEC });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many messages. Please try again in a few minutes." },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  const parsedBody = await parseJson(req, ContactBody);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  const name = String(body.name ?? "").trim().slice(0, 100);
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
  const subject = String(body.subject ?? "").trim().slice(0, 150);
  const message = String(body.message ?? "").trim().slice(0, 5000);
  // Honeypot — bots fill this hidden field, humans don't.
  if (String(body.website ?? "").trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  if (name.length < 2) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (message.length < 10) return NextResponse.json({ error: "Please write a message (at least 10 characters)." }, { status: 400 });

  const to = await getSupportEmail();
  const payload = { to, fromName: name, fromEmail: email, subject: subject || "New message", message };

  let emailed = await forwardViaResend(payload);
  if (!emailed) emailed = await forwardViaSmtp(payload);

  const doc: ContactMessageDoc = {
    name,
    email,
    subject: subject || "New message",
    message,
    createdAt: Date.now(),
    ipHash: createHash("sha256").update(ip).digest("hex").slice(0, 16),
    userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
    read: false,
    emailed,
  };
  await contactMessagesCol().add(doc);

  return NextResponse.json({ ok: true });
}
