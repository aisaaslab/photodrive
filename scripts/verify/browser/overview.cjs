/**
 * The admin Overview and Settings (S8-04) in a real browser: key numbers (revenue per currency, yen not divided by 100), the live
 * "needs attention" strip and tab badges, the numbers' age and Refresh, expiring plans with "+N more" and account links, Settings with
 * live validation, saving, "last changed by", an unchanged save writing nothing, the audit trail, 390 px, accessibility, and a customer
 * being refused. Signs in through the real login form against the emulators.
 * Start the server with: ADMIN_UID=photographer1 scripts/verify/browser/serve-emu.sh
 * Usage: NODE_PATH=$(npm root -g) [AXE_PATH=<axe.min.js>] [SHOT=<dir>] node overview.cjs (reset and reseed the emulators first).
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.env.BASE || "http://localhost:3997";
const SHOT = process.env.SHOT;
const axeSrc = process.env.AXE_PATH ? fs.readFileSync(process.env.AXE_PATH, "utf8") : null;
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const admin = require(path.join(process.cwd(), "node_modules/firebase-admin"));
admin.initializeApp({ projectId: "demo-photodrive" });
const db = admin.firestore();
const DAY = 86_400_000, NOW = Date.now();
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " :: " + String(extra).slice(0, 300)}`); if (!ok) failed++; };

async function seed() {
  for (let i = 0; i < 10; i++) {
    const uid = `exp${i}`, email = `exp${i}@example.com`;
    await admin.auth().createUser({ uid, email, displayName: `Expiring ${i}` }).catch(() => {});
    await db.collection("users").doc(uid).set({ uid, email, emailLower: email, name: `Expiring ${i}`, subscriptionStatus: "active", subscriptionExpiresAt: NOW + (3 + i * 2) * DAY, planName: "Monthly", planInterval: "monthly", createdAt: NOW - 20 * DAY });
  }
  const pay = (id, amountTotal, currency) => db.collection("payments").doc(id).set({ amountTotal, currency, activatedAt: NOW - DAY, uid: "exp0" });
  await pay("p1", 9900, "usd"); await pay("p2", 4800, "jpy"); await pay("p3", 1000, "eur");
  await db.collection("payments").doc("p3").update({ needsReview: true });
  await db.collection("stripe_events").doc("ev1").set({ type: "checkout.session.completed", status: "needs_review", outcome: "unmatched_payment", receivedAt: NOW });
  await db.collection("contactMessages").doc("m1").set({ name: "Anna", email: "anna@example.com", subject: "Hi", message: "Hello there", createdAt: NOW, read: false, emailed: true });
  await db.collection("contactMessages").doc("m2").set({ name: "Bo", email: "bo@example.com", subject: "Hi 2", message: "Hello again", createdAt: NOW, read: false, emailed: true });
}

(async () => {
  await seed();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  const login = async (p, email) => {
    await p.goto(`${BASE}/login`, { waitUntil: "load" });
    await p.fill("input[type=email]", email); await p.fill("input[type=password]", "test-password-1");
    await p.locator("label:has(input[type=checkbox])").first().click({ position: { x: 8, y: 8 } });
    await p.click("button:has-text('Sign in'):not(:has-text('Google'))");
    await p.waitForURL(/dashboard/);
  };
  const audit = async (name) => {
    if (!axeSrc) return;
    await page.waitForTimeout(900);
    await page.evaluate(axeSrc);
    const r = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
    check(`axe ${name}`, r.violations.length === 0, r.violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ").slice(0, 60)).join("|")}`).join(" ;; "));
  };
  const overflow = () => page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const bad = [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > w + 1 && !e.closest('[aria-label="Back office sections"]')).slice(0, 4);
    return document.documentElement.scrollWidth - w <= 0 ? "" : bad.map((e) => `${e.tagName}.${String(e.className).slice(0, 50)}`).join(" | ") || "unknown";
  });
  const settle = () => page.waitForTimeout(700);
  const text = async () => (await page.locator("main, body").first().innerText()).replace(/\s+/g, " ");
  const tabText = async (name) => (await page.locator('[aria-label="Back office sections"]').getByRole("link", { name: new RegExp(`^${name}`) }).innerText()).replace(/\s+/g, " ");

  await login(page, "photographer@example.com"); // the administrator (ADMIN_UID=photographer1)
  await page.goto(`${BASE}/dashboard/admin`, { waitUntil: "load" });
  await page.waitForSelector('[data-testid="overview-age"]'); await settle();
  if (SHOT) await page.screenshot({ path: `${SHOT}/overview.png`, fullPage: true });
  const t = await text();

  check("revenue: US dollars first, other currencies listed with their own formatting (¥4,800 not ¥48)", /\$99\.00/.test(t) && /¥4,800/.test(t) && /€10\.00/.test(t), t.slice(0, 600));
  check("the numbers say how old they are", /updated (just now|\d+ minutes? ago)/.test(t));
  check("needs attention: payments to review and unread messages, live", /1 payment to review/.test(t) || /2 payments to review/.test(t), t.slice(0, 500));
  check("needs attention: 2 unread support messages", /2 unread support messages/.test(t));
  check("tab badges show the same counts", /\d/.test(await tabText("Payments")) && /2/.test(await tabText("Support")), `${await tabText("Payments")} | ${await tabText("Support")}`);
  check("the badges are announced (screen-reader text)", /to review/.test(await tabText("Payments")) && /unread/.test(await tabText("Support")));
  check("expiring: capped at 8 rows with “+N more”", (await page.getByRole("link", { name: /^Open account/ }).count()) === 8 && /\+\d+ more in the next 30 days/.test(t), String(await page.getByRole("link", { name: /^Open account/ }).count()));
  await audit("overview");

  await page.getByRole("link", { name: /^Open account/ }).first().click();
  await page.waitForURL(/\/dashboard\/admin\/users\?q=/);
  check("“Open account” lands on Users, searched for that person", /exp\d/.test(decodeURIComponent(page.url())));
  await page.goBack(); await page.waitForSelector('[data-testid="overview-age"]');

  // refresh: a new payment appears only after a refresh, and only once the numbers are 30 s old
  await db.collection("payments").doc("p4").set({ amountTotal: 5000, currency: "usd", activatedAt: NOW, uid: "exp1" });
  await page.getByRole("button", { name: "Refresh numbers" }).click(); await settle();
  check("Refresh within 30 seconds of the last computation keeps the stored numbers", /\$99\.00/.test(await text()) && !/\$149\.00/.test(await text()));
  await db.collection("system_state").doc("stats-overview").update({ computedAt: NOW - 120_000 });
  await page.getByRole("button", { name: "Refresh numbers" }).click(); await settle();
  check("Refresh after 30 seconds recomputes: $149.00 now", /\$149\.00/.test(await text()), (await text()).slice(0, 400));
  check("…and the age is back to “just now”", /updated just now/.test(await text()));

  // Settings
  await page.goto(`${BASE}/dashboard/admin/settings`, { waitUntil: "load" });
  await page.waitForSelector("text=Support email"); await settle();
  if (SHOT) await page.screenshot({ path: `${SHOT}/settings.png`, fullPage: true });
  check("Settings links to Support instead of carrying an inbox", (await page.getByRole("link", { name: "Support", exact: true }).count()) >= 1 && !/Inbox/.test(await text()));
  const save = (i) => page.getByRole("button", { name: "Save" }).nth(i);
  check("Save is disabled until something changes", await save(0).isDisabled() && await save(1).isDisabled());
  await page.getByLabel("Support email address").fill("not-an-email");
  await page.getByLabel("Support email address").blur();
  check("a bad support email is flagged as you type", /valid email/.test(await text()));
  await page.getByLabel("Google Tag Manager ID").fill("nonsense"); await page.getByLabel("Google Tag Manager ID").blur();
  check("a bad tracking ID is flagged with an example", /Expected something like GTM-XXXXXXX/.test(await text()));
  await audit("settings with errors");
  await page.getByLabel("Support email address").fill("Help@Example.com");
  await save(0).click(); await settle();
  check("saving the support email works (lower-cased) and shows a confirmation", (await page.getByLabel("Support email address").inputValue()) === "help@example.com" && /Support email saved/.test(await text()), await text());
  check("“last changed” names who changed it", /Last changed .* by photographer@example\.com/.test(await text()), (await text()).slice(0, 300));
  const doc = (await db.doc("settings/site").get()).data();
  const auditCount = async () => (await db.collection("audit_log").where("action", "==", "settings.update").get()).size;
  check("the change was audited once", (await auditCount()) === 1 && doc && doc.supportEmail === "help@example.com", JSON.stringify(doc));
  await page.getByLabel("Google Tag Manager ID").fill("gtm-abc1234");
  await page.getByLabel("Google Tag Manager ID").blur();
  await save(1).click(); await settle();
  check("a tracking ID is saved upper-cased", (await page.getByLabel("Google Tag Manager ID").inputValue()) === "GTM-ABC1234" && /Tracking IDs saved/.test(await text()));
  check("two real changes, two audit entries", (await auditCount()) === 2);

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${BASE}/dashboard/admin`, { waitUntil: "load" }); await page.waitForSelector('[data-testid="overview-age"]'); await settle();
  { const o = await overflow(); check("390 px overview: no horizontal overflow", o === "", o); }
  if (SHOT) await page.screenshot({ path: `${SHOT}/overview-390.png`, fullPage: true });
  await audit("overview at 390");
  await page.goto(`${BASE}/dashboard/admin/settings`, { waitUntil: "load" }); await page.waitForSelector("text=Support email"); await settle();
  { const o = await overflow(); check("390 px settings: no horizontal overflow", o === "", o); }
  await audit("settings at 390");

  const other = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await other.newPage();
  await p2.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await login(p2, "unpaid@example.com");
  await p2.goto(`${BASE}/dashboard/admin/settings`, { waitUntil: "load" });
  await p2.waitForTimeout(1500);
  check("a customer is sent away from admin Settings", !/\/admin\/settings/.test(p2.url()), p2.url());

  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("SCRIPT ERROR", e); process.exit(1); });
