// Server-only helper (import from API routes only — never from client code).
import { getAdminDb } from "@/lib/firebase/admin";

export const DEFAULT_SUPPORT_EMAIL = "support@photodrive.co";
export const SITE_SETTINGS_DOC = "settings/site";

export type SiteSettings = {
  supportEmail: string;
  updatedAt?: number;
  updatedBy?: string | null;
};

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

/**
 * Resolve the support email recipient.
 *
 * Priority:
 *   1. Firestore `settings/site`.supportEmail (editable in admin back office)
 *   2. CONTACT_TO_EMAIL (server-only, no NEXT_PUBLIC_ prefix — this is the
 *      fix for the Vercel "Remove the public framework prefix" error: Vercel
 *      refuses sensitive-looking values in NEXT_PUBLIC_* vars because they
 *      ship in the browser bundle)
 *   3. Legacy NEXT_PUBLIC_SUPPORT_EMAIL (kept for backwards compat)
 *   4. Built-in default
 */
export async function getSupportEmail(): Promise<string> {
  try {
    const snap = await getAdminDb().doc(SITE_SETTINGS_DOC).get();
    const stored = snap.exists
      ? ((snap.data()?.supportEmail as string | undefined) ?? "")
      : "";
    if (stored && isValidEmail(stored)) return stored.trim();
  } catch {
    // Firestore unavailable (e.g. build time) — fall through to env.
  }

  const fromPrivate = (process.env.CONTACT_TO_EMAIL ?? "").trim();
  if (fromPrivate && isValidEmail(fromPrivate)) return fromPrivate;

  const legacy = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "").trim();
  if (legacy && isValidEmail(legacy)) return legacy;

  return DEFAULT_SUPPORT_EMAIL;
}

export async function getSiteSettings(adminUid?: string | null): Promise<SiteSettings> {
  const supportEmail = await getSupportEmail();
  let updatedAt: number | undefined;
  let updatedBy: string | null | undefined;
  try {
    const snap = await getAdminDb().doc(SITE_SETTINGS_DOC).get();
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
  const v = String(value ?? "").trim().toLowerCase();
  if (!isValidEmail(v) || v.length > 254) {
    throw new Error("Enter a valid email address.");
  }
  return v;
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
};
