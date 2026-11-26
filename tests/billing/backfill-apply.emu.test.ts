/** S2-08: back-fill apply. */
import { beforeEach, describe, expect, it } from "vitest";
import { clearEmulators, testDb } from "../helpers/db";
import { seedPayment, seedUser } from "../helpers/seed";
import { DAY_MS, LIFETIME_SENTINEL, MONTH_MS } from "@/lib/shared/billing-access";
import { REPORT_A_COLUMNS, buildReportA, toCsv } from "@/lib/server/billing/backfill";
import { ACTOR, applyBackfill, checkCliGuards, parseApprovedCsv, parseCsv, type ApprovedRow } from "@/lib/server/billing/backfill-apply";

const NOW = Date.UTC(2026, 10, 25, 12);
const T0 = NOW - 200 * DAY_MS;
const at = (d: number) => T0 + d * DAY_MS;
const iso = (ms: number) => new Date(ms).toISOString();

const pay = (id: string, uid: string, day: number) =>
  seedPayment(id, { uid, sessionId: id, interval: "monthly", activatedAt: at(day) });
/** A PAY-2 customer: two monthly payments, but only one month recorded on the account. */
async function pay2(uid: string, extra: Record<string, unknown> = {}) {
  await seedUser(uid, { subscriptionStatus: "active", subscriptionExpiresAt: at(0) + MONTH_MS, email: `${uid}@example.com`, ...extra });
  await pay(`${uid}-a`, uid, 0);
  await pay(`${uid}-b`, uid, 10);
}
const row = (uid: string, over: Partial<ApprovedRow> = {}): ApprovedRow => ({
  uid, category: "under_extended", expectedExpiry: iso(at(0) + 2 * MONTH_MS), currentExpiry: iso(at(0) + MONTH_MS), approved: true, ...over,
});
const run = (rows: ApprovedRow[], apply = true) =>
  applyBackfill(testDb(), rows, { apply, now: NOW, runId: "run-1", approvedBy: "Owner", source: "approved.csv" });
const user = (uid: string) => testDb().collection("users").doc(uid).get().then((s) => s.data()!);
const audits = () => testDb().collection("audit_log").get().then((s) => s.docs.map((d) => d.data()));

async function snapshot() {
  const out: Record<string, unknown> = {};
  for (const c of ["users", "payments", "audit_log"]) out[c] = (await testDb().collection(c).get()).docs.map((d) => [d.id, d.data()]).sort();
  return JSON.stringify(out);
}

beforeEach(clearEmulators);

describe("reading the approved file", () => {
  it("parses quotes, doubled quotes, newlines in cells and CRLF", () => {
    expect(parseCsv('a,b\r\n"x,1","say ""hi"""\r\n"multi\nline",z\r\n')).toEqual([["a", "b"], ["x,1", 'say "hi"'], ["multi\nline", "z"]]);
    expect(parseCsv("﻿a\n1")).toEqual([["a"], ["1"]]);
  });

  it("needs the uid, expectedExpiry and approved columns", () => {
    expect(parseApprovedCsv("uid,expectedExpiry\nu1,2026-01-01").error).toContain('"approved"');
    expect(parseApprovedCsv("").error).toContain("empty");
    expect(parseApprovedCsv("uid,approved\nu1,yes").error).toContain('"expectedExpiry"');
  });

  it("counts only yes / y / true / 1 / x as approved, ignoring case and spaces", () => {
    const { rows } = parseApprovedCsv(
      "uid,category,expectedExpiry,currentExpiry,approved\nu1,under_extended,2026-01-01T00:00:00.000Z,,YES\nu2,under_extended,2026-01-01T00:00:00.000Z,, x \nu3,under_extended,2026-01-01T00:00:00.000Z,,no\nu4,under_extended,2026-01-01T00:00:00.000Z,,\nu5,under_extended,2026-01-01T00:00:00.000Z,,maybe\n",
    );
    expect(rows.map((r) => [r.uid, r.approved])).toEqual([["u1", true], ["u2", true], ["u3", false], ["u4", false], ["u5", false]]);
  });

  it("reads a real Report A, with the formula-defusing apostrophes undone", async () => {
    await pay2("u1", { email: "=cmd@example.com" });
    const csv = toCsv((await buildReportA(testDb(), { now: NOW })).rows, REPORT_A_COLUMNS);
    expect(csv).toContain("'=cmd@example.com");
    const withApproval = csv.trimEnd().split("\n").map((l, i) => (i === 0 ? `${l},approved` : `${l},yes`)).join("\n");
    const { rows } = parseApprovedCsv(withApproval);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ uid: "u1", category: "under_extended", approved: true });
    expect((await run(rows))[0].outcome).toBe("applied"); // the report's own dates are accepted
  });
});

describe("applying", () => {
  it("raises an approved under-extended account to what its payments add up to, with an audit record", async () => {
    await pay2("u1");
    const [r] = await run([row("u1")]);
    expect(r).toMatchObject({ outcome: "applied", before: at(0) + MONTH_MS, after: at(0) + 2 * MONTH_MS });
    expect(await user("u1")).toMatchObject({ subscriptionExpiresAt: at(0) + 2 * MONTH_MS });

    const log = await audits();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      actorUid: ACTOR, action: "backfill_extend_expiry", targetType: "user", targetId: "u1", approvedBy: "Owner", runId: "run-1", source: "approved.csv", at: NOW,
      before: { subscriptionExpiresAt: at(0) + MONTH_MS }, after: { subscriptionExpiresAt: at(0) + 2 * MONTH_MS },
    });
  });

  it("makes a customer active again only when the corrected expiry is still in the future", async () => {
    // expected expiry in the future: status becomes active
    await seedUser("live", { subscriptionStatus: "expired", subscriptionExpiresAt: NOW - DAY_MS });
    await pay("live-a", "live", 190);
    await pay("live-b", "live", 195);
    const expected = at(190) + 2 * MONTH_MS; // > NOW
    expect(expected).toBeGreaterThan(NOW);
    await run([row("live", { expectedExpiry: iso(expected), currentExpiry: iso(NOW - DAY_MS) })]);
    expect(await user("live")).toMatchObject({ subscriptionStatus: "active", subscriptionExpiresAt: expected });
  });

  it("changes only the rows marked yes", async () => {
    await pay2("yes");
    await pay2("no");
    const results = await run([row("yes"), row("no", { approved: false })]);
    expect(results.map((r) => [r.uid, r.outcome])).toEqual([["yes", "applied"], ["no", "skipped_not_approved"]]);
    expect((await user("no")).subscriptionExpiresAt).toBe(at(0) + MONTH_MS);
    expect(await audits()).toHaveLength(1);
  });

  it("never reduces access: over-extended rows are skipped even when marked yes", async () => {
    await seedUser("extra", { subscriptionStatus: "active", subscriptionExpiresAt: at(0) + MONTH_MS + 60 * DAY_MS });
    await pay("extra-a", "extra", 0);
    const before = await snapshot();
    const [r] = await run([row("extra", { category: "over_extended", expectedExpiry: iso(at(0) + MONTH_MS), currentExpiry: iso(at(0) + MONTH_MS + 60 * DAY_MS) })]);
    expect(r.outcome).toBe("skipped_not_under_extended");
    expect(await snapshot()).toBe(before);
  });

  it("even a row mislabelled under_extended cannot lower an account (recomputed value is lower than current)", async () => {
    await seedUser("liar", { subscriptionStatus: "active", subscriptionExpiresAt: at(0) + MONTH_MS + 60 * DAY_MS });
    await pay("liar-a", "liar", 0);
    const before = await snapshot();
    const [r] = await run([row("liar", { expectedExpiry: iso(at(0) + MONTH_MS), currentExpiry: iso(at(0) + MONTH_MS + 60 * DAY_MS) })]);
    expect(r.outcome).toBe("skipped_would_lower");
    expect(await snapshot()).toBe(before);
  });

  it("is idempotent: running it again changes nothing and adds no second audit record", async () => {
    await pay2("u1");
    await run([row("u1")]);
    const afterFirst = await snapshot();
    const [second] = await run([row("u1")]);
    expect(second.outcome).toBe("skipped_changed_since_report"); // the account no longer looks like the report
    expect(await snapshot()).toBe(afterFirst);
    // and a report regenerated after the fix no longer lists the account at all
    expect((await buildReportA(testDb(), { now: NOW })).rows).toHaveLength(0);
  });

  it("two simultaneous runs of the same row apply it exactly once", async () => {
    await pay2("u1");
    const results = (await Promise.all([run([row("u1")]), run([row("u1")]), run([row("u1")])])).flat();
    expect(results.filter((r) => r.outcome === "applied")).toHaveLength(1);
    expect(await audits()).toHaveLength(1);
    expect((await user("u1")).subscriptionExpiresAt).toBe(at(0) + 2 * MONTH_MS);
  });
});

describe("re-checking against today's data (the file is a proposal)", () => {
  it("skips an account whose expiry changed since the report", async () => {
    await pay2("u1");
    await testDb().collection("users").doc("u1").update({ subscriptionExpiresAt: at(0) + MONTH_MS + 5 * DAY_MS });
    const [r] = await run([row("u1")]);
    expect(r.outcome).toBe("skipped_changed_since_report");
    expect((await user("u1")).subscriptionExpiresAt).toBe(at(0) + MONTH_MS + 5 * DAY_MS);
    expect(await audits()).toHaveLength(0);
  });

  it("skips an account whose payments changed since the report", async () => {
    await pay2("u1");
    await pay("u1-c", "u1", 20); // a new payment after the report was made
    const [r] = await run([row("u1")]);
    expect(r.outcome).toBe("skipped_payments_changed_since_report");
    expect(await audits()).toHaveLength(0);
  });

  it("skips deleted users, and users who are now comped or lifetime", async () => {
    await pay("gone-a", "gone", 0);
    await seedUser("comp", { subscriptionExpiresAt: at(0) + MONTH_MS, compGranted: true });
    await pay("comp-a", "comp", 0);
    await pay("comp-b", "comp", 10);
    await seedUser("life", { subscriptionExpiresAt: LIFETIME_SENTINEL });
    const results = await run([row("gone"), row("comp"), row("life", { currentExpiry: iso(LIFETIME_SENTINEL) })]);
    expect(results.map((r) => r.outcome)).toEqual(["skipped_user_missing", "skipped_comp_or_lifetime", "skipped_comp_or_lifetime"]);
    expect(await audits()).toHaveLength(0);
  });

  it("skips unreadable rows instead of failing the whole run", async () => {
    await pay2("u1");
    const results = await run([row("bad", { expectedExpiry: "not a date" }), row("u1")]);
    expect(results.map((r) => r.outcome)).toEqual(["skipped_bad_row", "applied"]);
  });
});

describe("dry run", () => {
  it("reports what would change and writes nothing", async () => {
    await pay2("u1");
    const before = await snapshot();
    const [r] = await run([row("u1")], false);
    expect(r).toMatchObject({ outcome: "would_apply", before: at(0) + MONTH_MS, after: at(0) + 2 * MONTH_MS });
    expect(await snapshot()).toBe(before);
  });
});

describe("command-line guard rails", () => {
  it("refuses to run without the approved file, in both modes", () => {
    expect(checkCliGuards({ apply: true }, "p")).toContain("--approved");
    expect(checkCliGuards({ apply: false }, "p")).toContain("--approved");
  });

  it("a dry run needs only the file; applying also needs who approved and the project confirmed", () => {
    expect(checkCliGuards({ apply: false, approvedFile: "a.csv" }, "prod")).toBeNull();
    expect(checkCliGuards({ apply: true, approvedFile: "a.csv" }, "prod")).toContain("--approved-by");
    expect(checkCliGuards({ apply: true, approvedFile: "a.csv", approvedBy: "  " }, "prod")).toContain("--approved-by");
    expect(checkCliGuards({ apply: true, approvedFile: "a.csv", approvedBy: "Owner" }, "prod")).toContain("--confirm-project prod");
    expect(checkCliGuards({ apply: true, approvedFile: "a.csv", approvedBy: "Owner", confirmProject: "staging" }, "prod")).toContain("--confirm-project prod");
    expect(checkCliGuards({ apply: true, approvedFile: "a.csv", approvedBy: "Owner", confirmProject: "prod" }, undefined)).toContain("FIREBASE_ADMIN_PROJECT_ID");
    expect(checkCliGuards({ apply: true, approvedFile: "a.csv", approvedBy: "Owner", confirmProject: "prod" }, "prod")).toBeNull();
  });
});
