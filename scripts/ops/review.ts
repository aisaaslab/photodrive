/**
 * S2-16: list and resolve payment items that need a human look (the same items the daily digest e-mails).
 *
 *   npx tsx --env-file=.env.local scripts/ops/review.ts list
 *   npx tsx --env-file=.env.local scripts/ops/review.ts resolve event evt_123 --by "Name" --note "Matched by hand"
 *   npx tsx --env-file=.env.local scripts/ops/review.ts resolve payment cs_live_abc --by "Name"
 *
 * Acts on whichever project FIREBASE_ADMIN_* point at, and prints it first. Customer e-mail addresses are never printed.
 */
import { getAdminDb } from "@/lib/firebase/admin";
import { listOpenReviewItems, markReviewed } from "@/lib/server/billing/review";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const [cmd, kind, id] = process.argv.slice(2);
  console.log(`Project: ${process.env.FIREBASE_ADMIN_PROJECT_ID ?? "(not set)"}`);
  const db = getAdminDb();

  if (cmd === "list") {
    const { events, payments } = await listOpenReviewItems(db);
    console.log(`\n${events.length} Stripe event(s) and ${payments.length} payment(s) need review.\n`);
    for (const e of events) console.log(`event   ${e.id}  ${e.outcome}  ${e.type}  ${new Date(e.receivedAt).toISOString()}${e.sessionId ? `  session ${e.sessionId}` : ""}`);
    for (const p of payments) console.log(`payment ${p.id}  ${p.status}  ${p.reviewNote ?? ""}`);
    return;
  }
  if (cmd === "resolve" && (kind === "event" || kind === "payment") && id) {
    const by = arg("by");
    if (!by?.trim()) throw new Error('Pass --by "<your name>": who reviewed it is recorded.');
    const result = await markReviewed(db, { kind, id, by: by.trim(), note: arg("note") });
    console.log(`${kind} ${id}: ${result}`);
    if (result !== "reviewed") process.exitCode = 1;
    return;
  }
  throw new Error("Usage: review.ts list | review.ts resolve <event|payment> <id> --by \"Name\" [--note \"...\"]");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
