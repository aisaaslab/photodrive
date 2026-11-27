import "server-only";
import type { Auth, UserRecord } from "firebase-admin/auth";
import { writeAudit } from "@/lib/server/audit";

/**
 * Granting and revoking the administrator role (S7-02). An administrator is a user whose Firebase custom claim `admin` is true (the
 * bootstrap account named by `ADMIN_UID` needs no claim). Used by `scripts/admin/set-admin-claim.ts`.
 *
 * Revoking also revokes the user's refresh tokens, so the role stops working at once: `requireAdmin` checks the token against the revocation
 * list instead of trusting an hour-old claim. Every change writes an audit entry.
 */
export type AdminChange = {
  uid: string; email: string | null; action: "grant" | "revoke";
  wasAdmin: boolean; willBeAdmin: boolean; applied: boolean;
};

export async function findUser(auth: Auth, ref: string): Promise<UserRecord> {
  return ref.includes("@") ? auth.getUserByEmail(ref.trim().toLowerCase()) : auth.getUser(ref.trim());
}

export async function changeAdminRole(auth: Auth, ref: string, action: "grant" | "revoke", opts: { apply: boolean; actor: string }): Promise<AdminChange> {
  const user = await findUser(auth, ref);
  const claims = { ...(user.customClaims ?? {}) } as Record<string, unknown>;
  const wasAdmin = claims.admin === true;
  const willBeAdmin = action === "grant";
  const result: AdminChange = { uid: user.uid, email: user.email ?? null, action, wasAdmin, willBeAdmin, applied: false };
  if (!opts.apply || wasAdmin === willBeAdmin) return result;

  if (willBeAdmin) claims.admin = true;
  else delete claims.admin;
  await auth.setCustomUserClaims(user.uid, Object.keys(claims).length ? claims : null);
  if (!willBeAdmin) await auth.revokeRefreshTokens(user.uid);
  await writeAudit({
    actorUid: opts.actor, action: willBeAdmin ? "admin.grant" : "admin.revoke", targetType: "admin", targetId: user.uid,
    before: { admin: wasAdmin }, after: { admin: willBeAdmin }, note: user.email ?? undefined,
  });
  return { ...result, applied: true };
}
