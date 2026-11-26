/**
 * Screenshots (and, with AXE_PATH=<axe.min.js>, an accessibility audit) of the redesigned user area, signed in through the real login form
 * against the emulators (S5-12). Usage: SHOT=<dir> [AXE_PATH=...] node user-area-shots.cjs. Reset and reseed the emulators first.
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const BASE = process.env.BASE || "http://localhost:3997";
const SHOT = process.env.SHOT || ".";
const axeSrc = process.env.AXE_PATH ? fs.readFileSync(process.env.AXE_PATH, "utf8") : null;
let failed = 0;

async function audit(page, name) {
  if (!axeSrc) return;
  await page.evaluate(axeSrc);
  const r = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  const bad = r.violations.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes.slice(0, 2).map((n) => n.target.join(" ").slice(0, 60)).join("; ")}`);
  console.log(`${bad.length ? "FAIL" : "PASS"} axe ${name}${bad.length ? ": " + bad.join(" | ") : ""}`);
  if (bad.length) failed++;
}

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", "test-password-1");
  await page.locator("label:has(input[type=checkbox])").first().click({ position: { x: 8, y: 8 } });
  await page.click("button:has-text('Sign in'):not(:has-text('Google'))");
  await page.waitForURL(/dashboard/);
}

(async () => {
  const browser = await chromium.launch();
  for (const w of [1280, 390]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${SHOT}/ua-login-${w}.png` }); await audit(page, `login ${w}`);
    await login(page, "photographer@example.com");
    await page.waitForSelector('button[aria-label="More"]'); await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOT}/ua-dashboard-${w}.png`, fullPage: true }); await audit(page, `dashboard ${w}`);
    const dialogShot = async (name) => { await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).catch(() => {}); await page.waitForTimeout(400); if (await page.locator('[role="dialog"]').count()) { await page.screenshot({ path: `${SHOT}/ua-${name}-${w}.png` }); await audit(page, `${name} ${w}`); await page.keyboard.press("Escape"); await page.waitForTimeout(300); } };
    await page.locator('button[aria-label="More"]').first().click();
    await page.locator("[role=menu] >> text=Edit").click(); await dialogShot("settings");
    await page.getByRole("button", { name: /New Gallery/ }).first().click(); await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOT}/ua-newgallery-${w}.png`, fullPage: true }); await audit(page, `new gallery form ${w}`);
    await page.reload({ waitUntil: "load" }); await page.waitForSelector('button[aria-label="More"]');
    await page.locator("button:has-text('Favori')").first().click(); await dialogShot("favourites");
    await page.goto(`${BASE}/dashboard/account`, { waitUntil: "load" }); await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOT}/ua-account-${w}.png`, fullPage: true }); await audit(page, `account ${w}`);
    await ctx.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
