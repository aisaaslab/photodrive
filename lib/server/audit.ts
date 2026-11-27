import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { auditLogCol } from "@/lib/server/repos/collections";
import { createLogger } from "@/lib/server/log";

/**
 * The audit trail of administrator actions (S7-03): who did what to which record, with the values before and after. Every mutation in
 * `app/api/admin/*` writes one entry through `writeAudit`; the back-fill and the admin scripts write theirs the same way.
 *
 * Entries are append-only and only the server can write them (Firestore rules deny every client access to `audit_log`). Secrets are never
 * stored: any field whose name looks like a password, token or secret is replaced by "[redacted]".
 */
export type AuditTarget = "user" | "gallery" | "plan" | "promoCode" | "settings" | "message" | "admin" | "payment";

export type AuditEntry = {
  /** The signed-in administrator (uid), or a script name such as "script:set-admin-claim". */
  actorUid: string;
  action: string;
  targetType: AuditTarget;
  targetId: string;
  before?: unknown;
  after?: unknown;
  note?: string;
};

const SECRET = /pass(word)?|secret|token|private[_-]?key|hash/i;

/** A copy that Firestore accepts (no `undefined`, no class instances) with secrets replaced. */
export function auditSafe(value: unknown, depth = 0): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
  if (depth > 6) return "[too deep]";
  if (Array.isArray(value)) return value.map((v) => auditSafe(v, depth + 1) ?? null);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = SECRET.test(k) ? "[redacted]" : auditSafe(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/**
 * Append one audit entry. Never throws: an action that already happened is not undone because its record could not be written, but the
 * failure is logged at error level so it is seen. Returns the entry id, or null if it could not be written.
 */
export async function writeAudit(entry: AuditEntry, db?: Firestore): Promise<string | null> {
  try {
    const ref = auditLogCol(db).doc();
    await ref.set({
      at: Date.now(),
      actorUid: entry.actorUid,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      ...(entry.before !== undefined && { before: auditSafe(entry.before) }),
      ...(entry.after !== undefined && { after: auditSafe(entry.after) }),
      ...(entry.note && { note: entry.note }),
    });
    return ref.id;
  } catch (err) {
    createLogger({ scope: "audit" }).error("could not write the audit entry", { action: entry.action, targetType: entry.targetType, targetId: entry.targetId, err });
    return null;
  }
}
