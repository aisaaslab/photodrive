/**
 * S4-01: restore sign-up dates (`users/{uid}.createdAt`) that the old sign-in code reset to the last sign-in.
 *
 *   npx tsx --env-file=.env.local scripts/migrations/restore-created-at.ts --out report.json            # dry run (default)
 *   npx tsx --env-file=.env.local scripts/migrations/restore-created-at.ts --out report.json --apply    # write
 *
 * Reads FIREBASE_ADMIN_* from the environment, i.e. it acts on whichever project those credentials point at, and prints that project
 * first. The dry run writes nothing; it lists every change (user, current date, restored date) in the report file and a summary on
 * screen. Show the report to the owner; apply only what they approved. `--apply` refuses to run without `--out`, because the report
 * (with every previous value) is written BEFORE anything is changed, so it can be undone by hand.
 * Dates only ever move earlier, and only by more than a day (see lib/server/migrations/restore-created-at.ts).
 */
import { writeFileSync } from "node:fs";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { applyRestore, planRestore, readProfiles, type AuthRecord } from "@/lib/server/migrations/restore-created-at";

async function listAuthUsers(): Promise<AuthRecord[]> {
  const out: AuthRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await getAdminAuth().listUsers(1000, pageToken);
    for (const u of page.users) out.push({ uid: u.uid, creationMs: Date.parse(u.metadata.creationTime) });
    pageToken = page.pageToken;
  } while (pageToken);
  return out;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const outIdx = process.argv.indexOf("--out");
  const out = outIdx > -1 ? process.argv[outIdx + 1] : undefined;
  if (apply && !out) {
    console.error("Refusing to apply without --out <file>: the report with the previous values must be written first.");
    process.exit(2);
  }
  console.log(`Project: ${process.env.FIREBASE_ADMIN_PROJECT_ID ?? "(FIREBASE_ADMIN_PROJECT_ID not set)"}`);
  console.log(`Mode:    ${apply ? "APPLY (writes)" : "dry run (no writes)"}`);

  const [profiles, authUsers] = await Promise.all([readProfiles(getAdminDb()), listAuthUsers()]);
  const plan = planRestore(profiles, authUsers);

  const reset = plan.changes.filter((c) => c.reason === "reset_by_login").length;
  console.log(`\nProfiles read:                 ${profiles.length}`);
  console.log(`Would restore (reset by login): ${reset}`);
  console.log(`Would set (date missing):       ${plan.changes.length - reset}`);
  console.log(`Already correct:                ${plan.unchanged}`);
  console.log(`No Firebase Auth account:       ${plan.noAuthAccount.length} (left alone)`);

  if (out) {
    writeFileSync(out, JSON.stringify({ project: process.env.FIREBASE_ADMIN_PROJECT_ID, at: new Date().toISOString(), ...plan }, null, 2));
    console.log(`\nReport written to ${out}`);
  }
  if (!apply) {
    console.log("\nDry run: nothing was changed. Re-run with --apply (and --out) after the owner has reviewed the report.");
    return;
  }
  const written = await applyRestore(getAdminDb(), plan.changes);
  console.log(`\nApplied: ${written} profile(s) updated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
