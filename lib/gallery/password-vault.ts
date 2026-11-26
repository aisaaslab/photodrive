import "server-only";
// Server-only helper (import from API routes only — never from client code).
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";
import { galleryVisibility, type Visibility } from "@/lib/gallery/visibility";

/**
 * Reversible, encrypted storage for gallery passwords.
 *
 * Photographers can see the password they set on a gallery (to remind a client
 * who lost it), so the value can't be hash-only. It used to be stored as
 * plaintext next to the bcrypt hash; now it is sealed with AES-256-GCM and only
 * the sealed form is written to Firestore (`passwordEnc`). Anyone who can read
 * the database — a backup, a leaked export, a misconfigured rule — no longer
 * gets usable passwords.
 *
 * The key is derived (HKDF-SHA256) from GALLERY_JWT_SECRET, which every
 * deployment already has, so there is nothing new to configure. Rotating that
 * secret makes old sealed values unreadable: the dashboard then shows no
 * reminder and the photographer simply sets a new password. Clients are never
 * affected — they are verified against the bcrypt hash.
 *
 * Sealed format:  v1.<iv>.<tag>.<ciphertext>   (base64url parts)
 */

const VERSION = "v1";

function key(): Buffer {
  const secret = process.env.GALLERY_JWT_SECRET;
  if (!secret) throw new Error("GALLERY_JWT_SECRET is not set");
  return Buffer.from(hkdfSync("sha256", secret, "photodrive", "gallery-password-vault", 32));
}

export function sealPassword(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

/** Returns the plaintext, or null if the value is missing, malformed or can't be decrypted. */
export function openPassword(sealed: unknown): string | null {
  if (typeof sealed !== "string") return null;
  const [v, iv, tag, ct] = sealed.split(".");
  if (v !== VERSION || !iv || !tag || !ct) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function forOwner<T extends object>(
  data: T,
): Omit<T, "passwordEnc" | "password" | "visibility"> & { password: string | null; visibility: Visibility } {
  const rest = { ...data } as Record<string, unknown>;
  const sealed = rest.passwordEnc;
  delete rest.passwordEnc; // never leaves the server
  const legacy = typeof rest.password === "string" ? rest.password : null;
  const out = { ...rest, password: openPassword(sealed) ?? legacy, visibility: galleryVisibility(rest) };
  // The one cast: the shape is built from a loosely typed copy, and is exactly the declared return type.
  return out as Omit<T, "passwordEnc" | "password" | "visibility"> & { password: string | null; visibility: Visibility };
}
