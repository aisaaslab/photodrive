/**
 * What the sign-in upsert writes to the photographer's own `users/{uid}` profile (S4-01). Pure (no Firebase import) so the rules
 * about what may be written are testable.
 *
 * `createdAt` is set ONCE, when the profile is first created (or, for an old document, when it has none). It used to be written on
 * every sign-in, which reset the sign-up date to the last login. `name` and `photoURL` from Google are only written when nothing is
 * stored, so edits made in Account settings and custom avatars survive later sign-ins.
 */
export type StoredProfile = { name?: unknown; photoURL?: unknown; createdAt?: unknown } | undefined;

export type ProfileInput = { email: string; name: string; photoURL?: string };

/** `createdAtNow` is where the server timestamp goes (`serverTimestamp()` in the browser); a plain value in tests. */
export function buildProfileWrite<T>(uid: string, existing: StoredProfile, profile: ProfileInput, createdAtNow: T): Record<string, unknown> {
  // `emailLower` is what the admin search runs on (S7-05); it is rewritten with the e-mail so the two never disagree.
  const data: Record<string, unknown> = { uid, email: profile.email, emailLower: profile.email.trim().toLowerCase() };
  if (existing === undefined || existing.createdAt === undefined || existing.createdAt === null) data.createdAt = createdAtNow;
  if (existing === undefined || !existing.name) data.name = profile.name;
  if ((existing === undefined || !existing.photoURL) && profile.photoURL) data.photoURL = profile.photoURL;
  return data;
}
