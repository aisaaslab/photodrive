/**
 * S7-05: fill in `users/{uid}.emailLower` (the field the admin Users search runs on) for profiles created before it existed.
 *
 *   npx tsx --env-file=.env.local scripts/migrations/backfill-email-lower.ts --out report.json            # dry run (default)
 *   npx tsx --env-file=.env.local scripts/migrations/backfill-email-lower.ts --out report.json --apply    # write
 *
 * Acts on whichever project FIREBASE_ADMIN_* points at and prints that project first. The dry run writes nothing; the report lists every
 * profile that would change (with its previous value). `--apply` refuses to run without `--out`: the report is written BEFORE anything
 * is changed. Adds one field per profile and changes nothing else.
 */
import { writeFileSync } from "node:fs";
import { getAdminDb } from "@/lib/firebase/admin";
import { applyEmailLower, planEmailLower, readEmailProfiles } from "@/lib/server/migrations/backfill-email-lower";

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

  const profiles = await readEmailProfiles(getAdminDb());
  const plan = planEmailLower(profiles);
  console.log(`\nProfiles read:        ${profiles.length}`);
  console.log(`Would set / correct:  ${plan.changes.length}`);
  console.log(`Already correct:      ${plan.unchanged}`);
  console.log(`No e-mail stored:     ${plan.noEmail.length} (left alone)`);

  if (out) {
    writeFileSync(out, JSON.stringify({ project: process.env.FIREBASE_ADMIN_PROJECT_ID, at: new Date().toISOString(), ...plan }, null, 2));
    console.log(`\nReport written to ${out}`);
  }
  if (!apply) {
    console.log("\nDry run: nothing was changed. Re-run with --apply (and --out) after the owner has reviewed the report.");
    return;
  }
  const written = await applyEmailLower(getAdminDb(), plan.changes);
  console.log(`\nApplied: ${written} profile(s) updated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
