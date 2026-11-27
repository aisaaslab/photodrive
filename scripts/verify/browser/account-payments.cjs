/**
 * The payment list on the Account page (S5-12): what each payment bought, the access date, free codes, refund / dispute status and the
 * invoice link, at 1280 and 390 px with axe. Seeds payments for the seeded photographer and signs in through the real login form.
 * Usage: NODE_PATH=$(npm root -g) [AXE_PATH=<axe.min.js>] [SHOT=<dir>] node account-payments.cjs (reset and reseed the emulators first).
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.env.BASE || "http://localhost:3997";
const SHOT = process.env.SHOT;
const axeSrc = process.env.AXE_PATH ? fs.readFileSync(process.env.AXE_PATH, "utf8") : null;
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const admin = require(path.join(process.cwd(), "node_modules/firebase-admin"));
admin.initializeApp({ projectId: "demo-photodrive" });
const db = admin.firestore();
const DAY = 86_400_000, NOW = Date.now();
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " :: " + String(extra).slice(0, 300)}`); if (!ok) failed++; };

(async () => {
  const pay = (id, o) => db.collection("payments").doc(id).set({ uid: "photographer1", sessionId: id, currency: "usd", status: "fulfilled", source: "paid", ...o });
  await pay("cs_m", { amountTotal: 1200, activatedAt: NOW - 2 * DAY, interval: "monthly", expiresAtAfter: NOW + 28 * DAY, invoiceId: "in_1" });
  await pay("cs_y", { amountTotal: 9900, activatedAt: NOW - 40 * DAY, interval: "yearly", expiresAtAfter: NOW + 325 * DAY });
  await pay("cs_free", { amountTotal: 0, activatedAt: NOW - 60 * DAY, interval: "yearly", source: "free_code", expiresAtAfter: NOW + 305 * DAY });
  await pay("cs_ref", { amountTotal: 9900, activatedAt: NOW - 90 * DAY, interval: "yearly", status: "refunded", refundedAmount: 9900, expiresAtAfter: NOW + 275 * DAY });
  await pay("cs_old", { amountTotal: 900, activatedAt: NOW - 120 * DAY });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  const audit = async (name) => {
    if (!axeSrc) return;
    await page.waitForTimeout(700);
    await page.evaluate(axeSrc);
    const r = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
    check(`axe ${name}`, r.violations.length === 0, r.violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ").slice(0, 60)).join("|")}`).join(" ;; "));
  };
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.fill("input[type=email]", "photographer@example.com"); await page.fill("input[type=password]", "test-password-1");
  await page.locator("label:has(input[type=checkbox])").first().click({ position: { x: 8, y: 8 } });
  await page.click("button:has-text('Sign in'):not(:has-text('Google'))");
  await page.waitForURL(/dashboard/);
  await page.goto(`${BASE}/dashboard/account`, { waitUntil: "load" });
  const rows = page.locator("ul.divide-y > li").filter({ hasText: /\$|Free/ });
  await rows.first().waitFor(); await page.waitForTimeout(500);
  const txt = async (i) => (await rows.nth(i).innerText()).replace(/\s+/g, " ");
  check("five payments are listed, newest first", (await rows.count()) === 5, String(await rows.count()));
  const m = await txt(0), y = await txt(1), f = await txt(2), r = await txt(3), o = await txt(4);
  check("a monthly payment says Monthly access, its amount, and until when", /Monthly access/.test(m) && /\$12\.00/.test(m) && /Access until/.test(m), m);
  check("…and has an Invoice link (the one that was issued one)", /Invoice/.test(m) && !/Invoice/.test(y), `${m} | ${y}`);
  check("a yearly payment says Annual access and until when", /Annual access/.test(y) && /\$99\.00/.test(y) && /Access until/.test(y), y);
  check("a free code says so, shows Free (not $0.00)", /Free access code/.test(f) && /Free/.test(f) && !/\$0/.test(f), f);
  check("a refunded payment shows Refunded and its explanation, and no access date", /Refunded/.test(r) && /\$99\.00/.test(r) && !/Access until/.test(r), r);
  check("an old payment without details keeps the generic title", /Annual license/.test(o), o);
  if (SHOT) await page.screenshot({ path: `${SHOT}/account-payments.png`, fullPage: true });
  await audit("account payments");
  await page.setViewportSize({ width: 390, height: 900 }); await page.waitForTimeout(300);
  check("390 px: no horizontal overflow", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  if (SHOT) await page.screenshot({ path: `${SHOT}/account-payments-390.png`, fullPage: true });
  await audit("account payments at 390");
  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("SCRIPT ERROR", e); process.exit(1); });
