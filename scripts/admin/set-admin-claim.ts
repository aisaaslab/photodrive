/**
 * S7-02: grant or revoke the administrator role (the Firebase custom claim `admin`).
 *
 *   npx tsx --env-file=.env.local scripts/admin/set-admin-claim.ts grant  someone@example.com            # dry run (default)
 *   npx tsx --env-file=.env.local scripts/admin/set-admin-claim.ts grant  someone@example.com --apply    # write
 *   npx tsx --env-file=.env.local scripts/admin/set-admin-claim.ts revoke someone@example.com --apply
 *
 * The second argument is an e-mail address or a Firebase uid. It acts on whichever project FIREBASE_ADMIN_* points at, and prints that
 * project first. A granted user must sign in again (or refresh their token) to see the role; a revoked user loses it at once. The change
 * is written to the audit log. The bootstrap account named by ADMIN_UID needs no claim and cannot be revoked here.
 */
import { getAdminAuth } from "@/lib/firebase/admin";
import { changeAdminRole } from "@/lib/server/admin-roles";

async function main() {
  const [action, ref] = process.argv.slice(2);
  const apply = process.argv.includes("--apply");
  if ((action !== "grant" && action !== "revoke") || !ref || ref.startsWith("--")) {
    console.error("Usage: set-admin-claim.ts grant|revoke <email-or-uid> [--apply]");
    process.exit(2);
  }
  console.log(`Project: ${process.env.FIREBASE_ADMIN_PROJECT_ID ?? "(FIREBASE_ADMIN_PROJECT_ID not set)"}`);
  console.log(`Mode:    ${apply ? "APPLY (writes)" : "dry run (no writes)"}`);
  const r = await changeAdminRole(getAdminAuth(), ref, action, { apply, actor: "script:set-admin-claim" });
  console.log(`User:    ${r.email ?? "(no e-mail)"} (${r.uid})`);
  console.log(`Admin:   ${r.wasAdmin ? "yes" : "no"} -> ${r.willBeAdmin ? "yes" : "no"}${r.wasAdmin === r.willBeAdmin ? " (nothing to change)" : ""}`);
  console.log(r.applied ? "Done." : apply ? "Nothing written." : "Dry run: nothing written. Add --apply to make the change.");
}

main().catch((err) => { console.error(err); process.exit(1); });
