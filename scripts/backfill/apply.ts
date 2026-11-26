/**
 * S2-08: back-fill APPLY. Corrects account expiries for customers the owner approved in the Report A review (S2-07).
 *
 *   # dry run (default): shows exactly what would change, writes nothing
 *   npx tsx --env-file=.env.local scripts/backfill/apply.ts --approved scripts/backfill/out/approved.csv
 *
 *   # apply: needs who approved and the project id repeated back to you
 *   npx tsx --env-file=.env.local scripts/backfill/apply.ts --apply --approved scripts/backfill/out/approved.csv \
 *       --approved-by "Owner Name" --confirm-project <FIREBASE_ADMIN_PROJECT_ID>
 *
 * The approved file is a copy of Report A with an extra `approved` column (yes / no per row).
 * Guarantees: it refuses to run without the file; only rows marked yes are considered; only `under_extended`
 * rows are ever applied and access is only ever RAISED; each row is re-checked against the data as it is now and
 * skipped if the account or its payments changed since the report; the change and its `audit_log` record are
 * written in one transaction; running it again changes nothing.
 * Rehearse it on the emulator or staging first, then run the dry run against production before `--apply`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAdminDb } from "@/lib/firebase/admin";
import { ACTOR, applyBackfill, checkCliGuards, parseApprovedCsv } from "@/lib/server/billing/backfill-apply";
import { csvCell } from "@/lib/server/billing/backfill";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const apply = process.argv.includes("--apply");
  const approvedFile = arg("approved");
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;

  const guard = checkCliGuards(
    { apply, approvedFile, approvedBy: arg("approved-by"), confirmProject: arg("confirm-project") },
    projectId,
  );
  if (guard) throw new Error(guard);

  const parsed = parseApprovedCsv(readFileSync(approvedFile!, "utf8"));
  if (parsed.error) throw new Error(parsed.error);

  const runId = `backfill-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  console.log(`Project:  ${projectId ?? "(not set)"}`);
  console.log(`Mode:     ${apply ? "APPLY (writes)" : "dry run (no writes)"}`);
  console.log(`File:     ${approvedFile} (${parsed.rows.length} rows, ${parsed.rows.filter((r) => r.approved).length} approved)`);
  console.log(`Actor:    ${ACTOR}, run ${runId}\n`);

  const results = await applyBackfill(getAdminDb(), parsed.rows, {
    apply, runId, approvedBy: arg("approved-by") ?? "(dry run)", source: approvedFile!,
  });

  const counts: Record<string, number> = {};
  for (const r of results) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
  console.log("Outcome per row:", counts);

  const outDir = join(process.cwd(), "scripts", "backfill", "out");
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${apply ? "apply" : "dry-run"}-${runId}.csv`);
  const iso = (n?: number) => (n ? new Date(n).toISOString() : "");
  writeFileSync(
    file,
    ["uid,outcome,before,after,detail", ...results.map((r) => [r.uid, r.outcome, iso(r.before), iso(r.after), r.detail ?? ""].map(csvCell).join(","))].join("\n") + "\n",
  );
  console.log(`Result written to ${file}`);
  if (!apply) console.log("\nNothing was changed. Re-run with --apply --approved-by ... --confirm-project ... once the dry run looks right.");
  if (results.some((r) => r.outcome === "error")) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
