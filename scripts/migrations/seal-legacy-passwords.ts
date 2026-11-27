/**
 * S4-04: seal and clear the legacy plaintext gallery passwords.
 *
 *   npx tsx --env-file=.env.local scripts/migrations/seal-legacy-passwords.ts --out report.json            # dry run (default)
 *   npx tsx --env-file=.env.local scripts/migrations/seal-legacy-passwords.ts --out report.json --apply    # write
 *
 * Reads FIREBASE_ADMIN_* from the environment, i.e. it acts on whichever project those credentials point at, and prints that project
 * first. IMPORTANT: GALLERY_JWT_SECRET must be the SAME value the deployed app uses, because passwords are sealed with a key derived
 * from it; sealed with another secret, the dashboard could not read them back (visitors are unaffected: they are checked against the
 * bcrypt hash). The dry run writes nothing. The report lists galleries and what would happen; it never contains a password.
 * `--apply` refuses to run without `--out`. See lib/server/migrations/seal-legacy-passwords.ts for what each action means.
 * Safe to re-run: galleries already done are not touched, and a password the owner changed after the dry run is never overwritten.
 */
import { writeFileSync } from "node:fs";
import { getAdminDb } from "@/lib/firebase/admin";
import { applySeal, planSeal, readGalleries, reportOf } from "@/lib/server/migrations/seal-legacy-passwords";
import { openPassword, sealPassword } from "@/lib/gallery/password-vault";

async function main() {
  const apply = process.argv.includes("--apply");
  const outIdx = process.argv.indexOf("--out");
  const out = outIdx > -1 ? process.argv[outIdx + 1] : undefined;
  if (apply && !out) {
    console.error("Refusing to apply without --out <file>.");
    process.exit(2);
  }
  if (!process.env.GALLERY_JWT_SECRET) {
    console.error("GALLERY_JWT_SECRET is not set. It must be the same value the deployed app uses.");
    process.exit(2);
  }
  if (openPassword(sealPassword("self-test")) !== "self-test") {
    console.error("The sealing self-test failed; not continuing.");
    process.exit(2);
  }
  console.log(`Project: ${process.env.FIREBASE_ADMIN_PROJECT_ID ?? "(FIREBASE_ADMIN_PROJECT_ID not set)"}`);
  console.log(`Mode:    ${apply ? "APPLY (writes)" : "dry run (no writes)"}`);

  const plan = await planSeal(await readGalleries(getAdminDb()));
  const report = reportOf(plan);
  console.log(`\nGalleries with no plaintext password: ${report.alreadyClean}`);
  console.log(`Plaintext passwords to remove:        ${report.toChange}`);
  console.log(`  sealed and then cleared:            ${report.sealAndClear}`);
  console.log(`  cleared only (see notes in report): ${report.clearOnly}`);
  if (out) {
    writeFileSync(out, JSON.stringify({ project: process.env.FIREBASE_ADMIN_PROJECT_ID, at: new Date().toISOString(), ...report }, null, 2));
    console.log(`\nReport written to ${out} (no passwords in it)`);
  }
  if (!apply) {
    console.log("\nDry run: nothing was changed. Re-run with --apply (and --out) after the owner has reviewed the report.");
    return;
  }
  const result = await applySeal(getAdminDb(), plan.items);
  console.log(`\nApplied: ${result.changed} gallery document(s) updated, ${result.skippedChanged} left alone because they changed meanwhile.`);
  const after = await planSeal(await readGalleries(getAdminDb()));
  console.log(`Plaintext passwords remaining: ${after.items.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
