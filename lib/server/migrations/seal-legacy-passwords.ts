import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { verifyPassword } from "@/lib/gallery/password";
import { openPassword, sealPassword } from "@/lib/gallery/password-vault";
import { galleriesCol } from "@/lib/server/repos/collections";

/**
 * S4-04: remove the legacy plaintext gallery passwords. Old galleries stored the password in plaintext (`password`) next to the
 * bcrypt hash; since the vault was added it is stored sealed (`passwordEnc`, AES-256-GCM) and the plaintext field is null. Until
 * now an old plaintext copy was sealed lazily the first time an owner or admin listed galleries (a write on a read). This does it
 * once, on purpose, with a report, and the read endpoints no longer write.
 *
 * Every plaintext copy is cleared; what differs is whether the owner's "remind me of the password" copy is kept:
 *  - `seal_and_clear`: no sealed copy yet and the plaintext is verified against the bcrypt hash (so it IS the real password):
 *    it is sealed, then the plaintext is cleared.
 *  - `clear_only`: a sealed copy already exists (it wins: it is what the dashboard shows), or the plaintext cannot be verified
 *    (no hash, or it does not match the hash, so it is not the password visitors need). Clearing loses nothing that works.
 *
 * Reports and logs NEVER contain a password: only the gallery id, owner and what would happen.
 */
export type SealAction = "seal_and_clear" | "clear_only";

export type SealItem = {
  id: string;
  photographerId: string | null;
  action: SealAction;
  /** Why this action; for the owner reading the report. */
  note: string;
};

/** In memory only, never written to a report: what the apply step needs. */
type Secret = { plain: string; enc: string | null };
export type PlannedSeal = SealItem & { secret: Secret };

export type SealPlan = { items: PlannedSeal[]; alreadyClean: number };

type GalleryData = { password?: unknown; passwordEnc?: unknown; passwordHash?: unknown; photographerId?: unknown };

/** Decides what to do for each gallery. Writes nothing. */
export async function planSeal(galleries: { id: string; data: GalleryData }[]): Promise<SealPlan> {
  const plan: SealPlan = { items: [], alreadyClean: 0 };
  for (const { id, data } of galleries) {
    if (typeof data.password !== "string" || data.password === "") {
      plan.alreadyClean++;
      continue;
    }
    const plain = data.password;
    const photographerId = typeof data.photographerId === "string" ? data.photographerId : null;
    const sealed = typeof data.passwordEnc === "string" && data.passwordEnc ? data.passwordEnc : null;

    if (sealed) {
      const same = openPassword(sealed) === plain;
      plan.items.push({
        id, photographerId, action: "clear_only", secret: { plain, enc: null },
        note: same ? "already sealed; the plaintext copy is redundant" : "a sealed copy exists and differs; the sealed copy is kept as the authoritative one",
      });
      continue;
    }
    const hash = typeof data.passwordHash === "string" && data.passwordHash ? data.passwordHash : null;
    if (hash && (await verifyPassword(plain, hash))) {
      plan.items.push({ id, photographerId, action: "seal_and_clear", secret: { plain, enc: sealPassword(plain) }, note: "plaintext matches the password hash; sealed, then cleared" });
    } else {
      plan.items.push({
        id, photographerId, action: "clear_only", secret: { plain, enc: null },
        note: hash ? "plaintext does not match the password hash, so it is not the live password; cleared without keeping a reminder" : "no password hash, so the plaintext is not in use; cleared without keeping a reminder",
      });
    }
  }
  return plan;
}

/** The plan without anything secret: safe to print and to save. */
export const reportOf = (plan: SealPlan) => ({
  alreadyClean: plan.alreadyClean,
  toChange: plan.items.length,
  sealAndClear: plan.items.filter((i) => i.action === "seal_and_clear").length,
  clearOnly: plan.items.filter((i) => i.action === "clear_only").length,
  items: plan.items.map(({ id, photographerId, action, note }) => ({ id, photographerId, action, note })),
});

/** Reads only the fields the plan needs. */
export async function readGalleries(db: Firestore) {
  const snap = await galleriesCol(db).select("password", "passwordEnc", "passwordHash", "photographerId").get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as GalleryData }));
}

export type ApplyResult = { changed: number; skippedChanged: number };

/**
 * Applies a plan. Each gallery is re-read inside a transaction: if its plaintext password is no longer the one that was planned
 * (the owner changed it in the meantime), it is left alone, so a newer password is never overwritten. Safe to re-run.
 */
export async function applySeal(db: Firestore, items: PlannedSeal[]): Promise<ApplyResult> {
  const result: ApplyResult = { changed: 0, skippedChanged: 0 };
  for (const item of items) {
    const ref = galleriesCol(db).doc(item.id);
    const done = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.get("password") !== item.secret.plain) return false;
      tx.update(ref, { password: null, ...(item.secret.enc ? { passwordEnc: item.secret.enc } : {}) });
      return true;
    });
    if (done) result.changed++;
    else result.skippedChanged++;
  }
  return result;
}
