import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { usersCol } from "@/lib/server/repos/collections";

/** S7-05: the admin search runs on `users/{uid}.emailLower`. New sign-ins write it; this fills it in for profiles created before. */
export type EmailLowerProfile = { uid: string; email: string | null; emailLower: string | null };
export type EmailLowerChange = { uid: string; email: string; from: string | null; to: string };
export type EmailLowerPlan = { changes: EmailLowerChange[]; unchanged: number; noEmail: string[] };

export const normaliseEmail = (e: string) => e.trim().toLowerCase();

/** Pure: decides what would change. Writes nothing. A profile without any e-mail is listed and left alone. */
export function planEmailLower(profiles: EmailLowerProfile[]): EmailLowerPlan {
  const plan: EmailLowerPlan = { changes: [], unchanged: 0, noEmail: [] };
  for (const p of profiles) {
    if (!p.email || !p.email.trim()) { plan.noEmail.push(p.uid); continue; }
    const to = normaliseEmail(p.email);
    if (p.emailLower === to) plan.unchanged++;
    else plan.changes.push({ uid: p.uid, email: p.email, from: p.emailLower, to });
  }
  return plan;
}

export async function readEmailProfiles(db: Firestore): Promise<EmailLowerProfile[]> {
  const snap = await usersCol(db).select("email", "emailLower").get();
  return snap.docs.map((d) => ({ uid: d.id, email: typeof d.get("email") === "string" ? (d.get("email") as string) : null, emailLower: typeof d.get("emailLower") === "string" ? (d.get("emailLower") as string) : null }));
}

/** One field per document, in batches. Re-running is harmless (an up-to-date profile is not planned again). */
export async function applyEmailLower(db: Firestore, changes: EmailLowerChange[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < changes.length; i += 400) {
    const batch = db.batch();
    for (const c of changes.slice(i, i + 400)) batch.update(usersCol(db).doc(c.uid), { emailLower: c.to });
    await batch.commit();
    written += Math.min(400, changes.length - i);
  }
  return written;
}
