/**
 * S2-06: back-fill REPORTS. Read-only: this script never writes to Firestore or Stripe.
 *
 *   npx tsx --env-file=.env.local scripts/backfill/report.ts                 # both reports
 *   npx tsx --env-file=.env.local scripts/backfill/report.ts --report a      # only Report A
 *   npx tsx --env-file=.env.local scripts/backfill/report.ts --report b --out /some/dir
 *
 * Report A replays every user's payments with the current stacking rule and lists accounts whose expiry
 * differs by more than a day. Report B lists paid Stripe sessions (last 13 months) that have no `payments`
 * document. CSVs go to scripts/backfill/out/ (git-ignored: they contain customer e-mail addresses).
 *
 * Against production, Report B needs the live Stripe key and `APP_ENV=production` (live keys are refused
 * anywhere else on purpose). Nothing here changes data: review the CSVs with the owner first (S2-07).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/server/billing/stripe";
import {
  REPORT_A_COLUMNS, REPORT_B_COLUMNS, buildReportA, buildReportB, toCsv,
} from "@/lib/server/billing/backfill";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const which = (arg("report") ?? "both").toLowerCase();
  if (!["a", "b", "both"].includes(which)) throw new Error('--report must be "a", "b" or "both"');
  const outDir = arg("out") ?? join(process.cwd(), "scripts", "backfill", "out");
  const stamp = new Date().toISOString().slice(0, 10);

  const db = getAdminDb();
  console.log(`Project: ${process.env.FIREBASE_ADMIN_PROJECT_ID ?? "(FIREBASE_ADMIN_PROJECT_ID not set)"}`);
  console.log("Mode:    READ ONLY (no writes to Firestore or Stripe)");
  mkdirSync(outDir, { recursive: true });

  if (which === "a" || which === "both") {
    const { rows, summary } = await buildReportA(db);
    const file = join(outDir, `report-a-${stamp}.csv`);
    writeFileSync(file, toCsv(rows, REPORT_A_COLUMNS));
    console.log("\nReport A: payments replayed with the stacking rule vs current expiry");
    console.log(summary);
    console.log(`  ${rows.length} account(s) differ by more than a day -> ${file}`);
  }

  if (which === "b" || which === "both") {
    const { rows, summary } = await buildReportB(db, getStripe());
    const file = join(outDir, `report-b-${stamp}.csv`);
    writeFileSync(file, toCsv(rows, REPORT_B_COLUMNS));
    console.log("\nReport B: paid Stripe sessions with no payments document (last 13 months)");
    console.log(summary);
    console.log(`  ${rows.length} missing payment(s) -> ${file}`);
  }

  console.log("\nNext: share the CSVs with the owner; approve rows in a copy (S2-07). Nothing was changed.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
