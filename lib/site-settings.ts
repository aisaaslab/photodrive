import "server-only";
// Server-only helper (import from API routes only — never from client code).
import { siteSettingsDoc } from "@/lib/server/repos/collections";
import { SUPPORT_EMAIL } from "@/lib/branding";
import { checkSupportEmail, isEmail } from "@/lib/shared/site-rules";

export const DEFAULT_SUPPORT_EMAIL = SUPPORT_EMAIL;

export type SiteSettings = {
  supportEmail: string;
  updatedAt?: number;
  updatedBy?: string | null;
};

const isValidEmail = isEmail;

/**
 * Resolve the support email recipient.
 *
 * Single source of truth: Firestore `settings/site`.supportEmail, edited in
 * the admin back office (Dashboard → Admin → Settings). No env variable is
 * read here on purpose — env-based email is intentionally unsupported (Vercel
 * rejects sensitive-looking values under the NEXT_PUBLIC_ prefix, and the
 * address must stay editable at runtime without redeploys).
 *
 * Falls back to the built-in default when no admin value is stored yet.
 */
export async function getSupportEmail(): Promise<string> {
  try {
    const snap = await siteSettingsDoc().get();
    const stored = snap.exists
      ? ((snap.data()?.supportEmail as string | undefined) ?? "")
      : "";
    if (stored && isValidEmail(stored)) return stored.trim().toLowerCase();
  } catch {
    // Firestore unavailable — fall through to the default.
  }

  return DEFAULT_SUPPORT_EMAIL;
}

export async function getSiteSettings(adminUid?: string | null): Promise<SiteSettings> {
  const supportEmail = await getSupportEmail();
  let updatedAt: number | undefined;
  let updatedBy: string | null | undefined;
  try {
    const snap = await siteSettingsDoc().get();
    if (snap.exists) {
      updatedAt = snap.data()?.updatedAt as number | undefined;
      updatedBy = (snap.data()?.updatedBy as string | undefined) ?? null;
    }
  } catch {
    // ignore
  }
  void adminUid;
  return { supportEmail, updatedAt, updatedBy };
}

export function validateSupportEmail(value: unknown): string {
  const r = checkSupportEmail(value);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

export type ContactMessageDoc = {
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: number;
  ipHash?: string | null;
  userAgent?: string | null;
  read?: boolean;
  emailed?: boolean;
  /** Support inbox (S8-02): `resolved` once an administrator has dealt with it; anything else is open. */
  status?: "open" | "resolved";
  resolvedAt?: number;
  resolvedBy?: string;
  /** An internal note by an administrator; never shown to the sender. */
  note?: string;
  noteAt?: number;
  noteBy?: string;
};
