/**
 * S1-07: create the default "Annual" plan (replaces the hard-coded $99 checkout).
 *
 *   npx tsx --env-file=.env.local scripts/migrations/seed-default-plan.ts            # dry run (default)
 *   npx tsx --env-file=.env.local scripts/migrations/seed-default-plan.ts --apply    # write
 *
 * Reads FIREBASE_ADMIN_* from the environment, i.e. it acts on whichever project those
 * credentials point at. It prints that project first. Only creates a plan when no plans exist.
 * Run the dry run against production, show the output to the owner, apply only when approved.
 */
import { getAdminDb } from "@/lib/firebase/admin";
import { seedDefaultPlan } from "@/lib/server/billing/seed-default-plan";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Project: ${process.env.FIREBASE_ADMIN_PROJECT_ID ?? "(FIREBASE_ADMIN_PROJECT_ID not set)"}`);
  console.log(`Mode:    ${apply ? "APPLY (writes)" : "dry run (no writes)"}`);

  const result = await seedDefaultPlan(getAdminDb(), { apply });
  if (result.action === "skip") {
    console.log(`Nothing to do: ${result.reason === "already_seeded" ? "default plan already exists" : "plans already exist"}.`);
    console.log(`Existing plan ids: ${result.existingPlanIds.join(", ") || "(none)"}`);
    return;
  }
  console.log(result.applied ? "Created plan:" : "Would create plan:");
  console.log(JSON.stringify(result.plan, null, 2));
  if (!result.applied) console.log("\nRe-run with --apply to write it.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
