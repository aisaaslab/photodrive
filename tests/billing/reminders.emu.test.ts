/** S9-03: the daily renewal-reminder job against the real Firestore emulator, on a fake clock with a fake mail sender. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testDb } from "../helpers/db";
import { seedUser } from "../helpers/seed";
import { createLogger } from "@/lib/server/log";
import { LOCALES } from "@/lib/i18n/languages";
import { LIFETIME_SENTINEL } from "@/lib/shared/billing-access";
import { maskEmail, runReminders } from "@/lib/server/reminders";
import { reminderKey } from "@/lib/shared/reminders";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
const { GET: cron } = await import("@/app/api/cron/reminders/route");

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 27, 9, 37);
const log = createLogger({ scope: "t" });
type Mail = { to: string; subject: string; text: string; html: string; replyTo?: string };
let outbox: Mail[];
let failNext = 0;
const send = async (m: Mail) => {
  if (failNext > 0) { failNext--; return false; }
  outbox.push(m);
  return true;
};
const run = (now: number, over: Partial<Parameters<typeof runReminders>[0]> = {}) =>
  runReminders({ db: testDb(), mode: "send", log, now, send, earlyRenewal: true, ...over });
const sent = async (uid: string) => ((await testDb().collection("users").doc(uid).get()).data()?.remindersSent ?? {}) as Record<string, number>;

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  outbox = [];
  failNext = 0;
  vi.stubEnv("CRON_SECRET", "s3cret");
  vi.stubEnv("GALLERY_LAPSE_ENFORCE", "1");
  for (const m of ["log", "warn", "error", "info"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

describe("a test account on a simulated timeline", () => {
  it("receives all three e-mails, each once, even when the job runs twice a day", async () => {
    const exp = T0 + 20 * DAY;
    await seedUser("u1", { name: "Maria Papadopoulou", subscriptionStatus: "active", subscriptionExpiresAt: exp });
    const log2: string[] = [];
    for (let day = 0; day <= 26; day++) {
      for (let r = 0; r < 2; r++) {
        const before = outbox.length;
        await run(T0 + day * DAY);
        if (outbox.length > before) log2.push(`day${day}:${outbox[outbox.length - 1].subject}`);
      }
    }
    expect(log2).toEqual([
      "day6:Your PhotoDrive plan ends in 14 days",
      "day17:Your PhotoDrive plan ends in 3 days",
      "day20:Your PhotoDrive plan has ended",
    ]);
    expect(Object.keys(await sent("u1")).sort()).toEqual(["expiring14:2026-12-17", "expiring3:2026-12-17", "lapsed:2026-12-17"]);
    expect(outbox.every((m) => m.to === "u1@example.com" && m.text.startsWith("Hi Maria,"))).toBe(true);
  });

  it("running twice at the same moment sends once", async () => {
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: T0 + 2 * DAY });
    const [a, b] = await Promise.all([run(T0), run(T0)]);
    expect(a.sent + b.sent).toBe(1);
    expect(outbox).toHaveLength(1);
  });

  it("renewing starts a new period: the next expiry gets its own reminders", async () => {
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: T0 + 2 * DAY });
    await run(T0);
    expect(outbox).toHaveLength(1);
    const renewedTo = T0 + 2 * DAY + 365 * DAY;
    await testDb().collection("users").doc("u1").update({ subscriptionExpiresAt: renewedTo });
    await run(T0 + DAY);
    expect(outbox).toHaveLength(1); // nothing due for a plan that is a year away
    await run(renewedTo - 2 * DAY);
    expect(outbox).toHaveLength(2);
    expect(await sent("u1")).toHaveProperty([reminderKey("expiring3", renewedTo)]);
  });
});

describe("who is left out", () => {
  it("lifetime, comped, no e-mail address, not yet due, and plans that lapsed long ago", async () => {
    await seedUser("life", { subscriptionStatus: "active", subscriptionExpiresAt: LIFETIME_SENTINEL });
    await seedUser("comp", { subscriptionStatus: "active", subscriptionExpiresAt: T0 + 2 * DAY, compGranted: true });
    await seedUser("far", { subscriptionStatus: "active", subscriptionExpiresAt: T0 + 60 * DAY });
    await seedUser("old", { subscriptionStatus: "expired", subscriptionExpiresAt: T0 - 90 * DAY });
    await seedUser("noexp", { subscriptionStatus: "none" });
    await seedUser("noemail", { subscriptionStatus: "active", subscriptionExpiresAt: T0 + 2 * DAY, email: "" });
    const r = await run(T0);
    expect(outbox).toHaveLength(0);
    expect(r).toMatchObject({ sent: 0, due: 0, skippedNoEmail: 1 });
  });

  it("a plan that ended an hour ago gets the 'ended' notice, one that ended four days ago does not", async () => {
    await seedUser("fresh", { subscriptionStatus: "expired", subscriptionExpiresAt: T0 - 3_600_000 });
    await seedUser("stale", { subscriptionStatus: "expired", subscriptionExpiresAt: T0 - 4 * DAY });
    await run(T0);
    expect(outbox.map((m) => m.to)).toEqual(["fresh@example.com"]);
  });
});

describe("language and wording", () => {
  it("writes in the customer's stored language, and English when none is stored", async () => {
    await seedUser("de", { language: "de", subscriptionStatus: "active", subscriptionExpiresAt: T0 + 2 * DAY });
    await seedUser("none", { subscriptionStatus: "active", subscriptionExpiresAt: T0 + 2 * DAY });
    await run(T0);
    const by = Object.fromEntries(outbox.map((m) => [m.to, m.subject]));
    expect(by["de@example.com"]).toBe("Dein PhotoDrive-Abo läuft in 3 Tagen ab");
    expect(by["none@example.com"]).toBe("Your PhotoDrive plan ends in 3 days");
  });

  it("states the plan end date and says nothing about galleries going offline unless lapse enforcement is on", async () => {
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: Date.UTC(2026, 11, 1, 12) });
    await run(T0);
    // English dates are US English (LOCALES.en = en-US, D19): "December 1, 2026"
    expect(outbox[0].text).toContain("December 1, 2026");
    expect(outbox[0].text).toContain(new Date(Date.UTC(2026, 11, 1, 12)).toLocaleDateString(LOCALES.en, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }));
    expect(outbox[0].text).toContain("stay online for another 14 days");
    outbox = [];
    vi.stubEnv("GALLERY_LAPSE_ENFORCE", "0");
    await testDb().collection("users").doc("u1").update({ remindersSent: {} });
    await run(T0);
    expect(outbox[0].text).not.toContain("stay online");
  });
});

describe("early renewal", () => {
  it("until early renewal is on, the 14- and 3-day reminders are held back (their renew link would not work) but the 'ended' notice is sent", async () => {
    await seedUser("active", { subscriptionStatus: "active", subscriptionExpiresAt: T0 + 2 * DAY });
    await seedUser("ended", { subscriptionStatus: "expired", subscriptionExpiresAt: T0 - DAY });
    const r = await run(T0, { earlyRenewal: false });
    expect(r).toMatchObject({ sent: 1, heldBackNoEarlyRenewal: 1 });
    expect(outbox.map((m) => m.to)).toEqual(["ended@example.com"]);
    expect(await sent("active")).toEqual({}); // held back means nothing recorded: it is sent once the switch is on
    await run(T0, { earlyRenewal: true });
    expect(outbox.map((m) => m.to).sort()).toEqual(["active@example.com", "ended@example.com"]);
  });
});

describe("modes, failures and limits", () => {
  it("off does nothing at all", async () => {
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: T0 + 2 * DAY });
    const r = await run(T0, { mode: "off" });
    expect(r).toMatchObject({ mode: "off", scanned: 0, sent: 0 });
    expect(outbox).toHaveLength(0);
  });

  it("dry-run reports who would get what (addresses masked), and sends and records nothing", async () => {
    await seedUser("u1", { language: "es", subscriptionStatus: "active", subscriptionExpiresAt: T0 + 2 * DAY });
    await seedUser("u2", { subscriptionStatus: "expired", subscriptionExpiresAt: T0 - DAY });
    const r = await run(T0, { mode: "dry-run" });
    expect(outbox).toHaveLength(0);
    expect(r.sent).toBe(0);
    expect(r.planned).toEqual(expect.arrayContaining([
      { uid: "u1", kind: "expiring3", lang: "es", to: "u***@example.com", expiresAt: "2026-11-29" },
      { uid: "u2", kind: "lapsed", lang: "en", to: "u***@example.com", expiresAt: "2026-11-26" },
    ]));
    expect(JSON.stringify(r)).not.toContain("u1@example.com");
    expect(await sent("u1")).toEqual({});
    // and a real run afterwards still sends them
    await run(T0);
    expect(outbox).toHaveLength(2);
  });

  it("a failed send gives the claim back, so the next run tries again", async () => {
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: T0 + 2 * DAY });
    failNext = 1;
    const first = await run(T0);
    expect(first).toMatchObject({ sent: 0, failed: 1 });
    expect(await sent("u1")).toEqual({});
    const second = await run(T0 + 3_600_000);
    expect(second.sent).toBe(1);
    expect(outbox).toHaveLength(1);
  });

  it("sends at most the per-run limit, and the rest go out on the next run", async () => {
    for (let i = 0; i < 5; i++) await seedUser(`u${i}`, { subscriptionStatus: "active", subscriptionExpiresAt: T0 + 2 * DAY + i });
    const first = await run(T0, { maxSends: 2 });
    expect(first).toMatchObject({ sent: 2, deferred: 3 });
    const second = await run(T0 + DAY / 4, { maxSends: 10 });
    expect(second.sent).toBe(3);
    expect(new Set(outbox.map((m) => m.to)).size).toBe(5);
  });

  it("masks addresses", () => {
    expect(maskEmail("maria@example.com")).toBe("m***@example.com");
  });
});

describe("GET /api/cron/reminders", () => {
  const call = (query = "", auth: string | null = "Bearer s3cret") =>
    cron(new NextRequest(`http://localhost/api/cron/reminders${query}`, { headers: auth ? { authorization: auth } : {} }));

  it("refuses without the right secret, and when none is configured", async () => {
    expect((await call("", null)).status).toBe(401);
    expect((await call("", "Bearer wrong")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call()).status).toBe(500);
  });

  it("is off unless REMINDERS_MODE says otherwise, and nothing on the URL can turn sending on", async () => {
    expect(await (await call()).json()).toEqual({ skipped: "REMINDERS_MODE is off" });
    expect(await (await call("?mode=send")).json()).toEqual({ skipped: "REMINDERS_MODE is off" });
  });

  it("in dry-run it reports without sending; ?mode=dry-run lowers send to a dry run", async () => {
    await seedUser("u1", { subscriptionStatus: "active", subscriptionExpiresAt: Date.now() + 2 * DAY });
    vi.stubEnv("BILLING_FULFIL_V2", "1");
    vi.stubEnv("REMINDERS_MODE", "dry-run");
    const dry = await (await call()).json();
    expect(dry).toMatchObject({ mode: "dry-run", sent: 0 });
    expect(dry.planned).toHaveLength(1);
    vi.stubEnv("REMINDERS_MODE", "send");
    const lowered = await (await call("?mode=dry-run")).json();
    expect(lowered).toMatchObject({ mode: "dry-run", sent: 0 });
    expect(await sent("u1")).toEqual({});
  });
});
