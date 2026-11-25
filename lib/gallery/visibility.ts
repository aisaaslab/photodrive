/**
 * Gallery visibility (decision D18, S3-13). Pure: safe to import from server and client code.
 *
 * Every gallery is either
 *   - public:  no password, the link opens it; or
 *   - private: a password is required.
 *
 * Galleries created before this existed have no `visibility` field. They are derived, so nothing changes
 * for them: one with a password is private, one without is public.
 */

export type Visibility = "public" | "private";

/** Matches the limit the password-check endpoint accepts (a longer password could never be entered). */
export const MAX_GALLERY_PASSWORD_LENGTH = 200;

type Stored = { visibility?: unknown; passwordHash?: unknown };

const isVisibility = (v: unknown): v is Visibility => v === "public" || v === "private";
const hasHash = (g: Stored) => typeof g.passwordHash === "string" && g.passwordHash.length > 0;

/**
 * Is the gallery private? A stored password always counts (fail safe: a gallery with a password is never
 * served as public, even if its `visibility` field says otherwise).
 */
export function isPrivate(g: Stored): boolean {
  return hasHash(g) || g.visibility === "private";
}

export function galleryVisibility(g: Stored): Visibility {
  return isPrivate(g) ? "private" : "public";
}

export type VisibilityPlan =
  | {
      ok: true;
      visibility: Visibility;
      /** A new password to store, or null to leave the stored one unchanged. */
      newPassword: string | null;
      /** Remove the stored password (switching a private gallery to public). */
      clearPassword: boolean;
    }
  | { ok: false; error: string };

const NEEDS_PASSWORD = "A private gallery needs a password";
const PUBLIC_NO_PASSWORD = "A public gallery cannot have a password";

function readPassword(raw: unknown): { value: string } | { error: string } {
  if (raw === undefined || raw === null || raw === "") return { value: "" };
  if (typeof raw !== "string") return { error: "Invalid password" };
  if (raw.length > MAX_GALLERY_PASSWORD_LENGTH) return { error: `The password can be at most ${MAX_GALLERY_PASSWORD_LENGTH} characters` };
  return { value: raw };
}

/**
 * Rules for creating a gallery. Without an explicit `visibility` (older clients) a password means private
 * and no password means public, exactly as before.
 */
export function planCreate(input: { visibility?: unknown; password?: unknown }): VisibilityPlan {
  if (input.visibility !== undefined && !isVisibility(input.visibility)) return { ok: false, error: "Invalid visibility" };
  const pw = readPassword(input.password);
  if ("error" in pw) return { ok: false, error: pw.error };

  const visibility: Visibility = input.visibility ?? (pw.value ? "private" : "public");
  if (visibility === "private") {
    if (!pw.value) return { ok: false, error: NEEDS_PASSWORD };
    return { ok: true, visibility, newPassword: pw.value, clearPassword: false };
  }
  if (pw.value) return { ok: false, error: PUBLIC_NO_PASSWORD };
  return { ok: true, visibility, newPassword: null, clearPassword: false };
}

/**
 * Rules for editing a gallery. Understands both the new `visibility` field and the older
 * `password` / `removePassword` fields:
 *   - no `visibility`, a new password: the gallery becomes (or stays) private;
 *   - no `visibility`, `removePassword`: the gallery becomes public;
 *   - otherwise the stored visibility is kept.
 * A private gallery can never end up without a password, and a public one never keeps one.
 */
export function planUpdate(
  current: Stored,
  input: { visibility?: unknown; password?: unknown; removePassword?: unknown },
): VisibilityPlan {
  if (input.visibility !== undefined && !isVisibility(input.visibility)) return { ok: false, error: "Invalid visibility" };
  const pw = readPassword(input.password);
  if ("error" in pw) return { ok: false, error: pw.error };
  const removing = input.removePassword === true;

  const target: Visibility = input.visibility ?? (pw.value ? "private" : removing ? "public" : galleryVisibility(current));

  if (target === "private") {
    if (removing) return { ok: false, error: "A private gallery needs a password: switch it to public to remove it" };
    if (!pw.value && !hasHash(current)) return { ok: false, error: NEEDS_PASSWORD };
    return { ok: true, visibility: "private", newPassword: pw.value || null, clearPassword: false };
  }

  if (pw.value) return { ok: false, error: PUBLIC_NO_PASSWORD };
  return { ok: true, visibility: "public", newPassword: null, clearPassword: hasHash(current) };
}
