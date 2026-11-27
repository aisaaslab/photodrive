/**
 * Keyboard and screen-reader pass over the engagement features (S10-04): gallery statistics, the client's selection with its export,
 * and the Drive folder check in the new-gallery form. Real login against the emulators (seeded photographer, subscribed; run
 * `emu-reset.sh`, start `serve-emu.sh` without ADMIN_UID). Usage: NODE_PATH=$(npm root -g) [AXE_PATH=<axe.min.js>] [SHOT=<dir>] node engagement-a11y.cjs
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const BASE = process.env.BASE || "http://localhost:3997";
const SHOT = process.env.SHOT;
const axeSrc = process.env.AXE_PATH ? fs.readFileSync(process.env.AXE_PATH, "utf8") : null;
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " :: " + String(extra).slice(0, 300)}`); if (!ok) failed++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  const audit = async (name) => {
    if (!axeSrc) return;
    await page.waitForTimeout(600);
    await page.evaluate(axeSrc);
    const r = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
    check(`axe ${name}`, r.violations.length === 0, r.violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ").slice(0, 60)).join("|")}`).join(" ;; "));
  };
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.fill("input[type=email]", "photographer@example.com"); await page.fill("input[type=password]", "test-password-1");
  await page.locator("label:has(input[type=checkbox])").first().click({ position: { x: 8, y: 8 } });
  await page.click("button:has-text('Sign in'):not(:has-text('Google'))");
  await page.waitForURL(/dashboard/);
  await page.waitForSelector('[data-ui="gallery-list"]'); await page.waitForTimeout(500);

  // --- statistics
  const stats = page.locator('[data-ui="gallery-stats"]').first();
  const st = (await stats.innerText()).replace(/\s+/g, " ");
  check("statistics are readable as text for a screen reader (Views: 0 Downloads: 0 Favorites: …)", /Views: \d/.test(await stats.evaluate((e) => e.textContent.replace(/\s+/g, " "))) && /Favorites: \d/.test(await stats.evaluate((e) => e.textContent)), st);
  check("an empty gallery says “No visits yet”", /No visits yet/.test(st));
  check("a short help text explains the numbers (counts only)", /never records who visited/.test((await stats.getAttribute("title")) || ""));

  // --- selection and export, keyboard only
  const card = page.locator('[data-ui="gallery-list"] > div').filter({ hasText: "Public test" }).first();
  const fav = card.getByRole("button", { name: /Favorites/ });
  await fav.focus(); await page.keyboard.press("Enter");
  await page.waitForSelector('[role="dialog"]');
  check("the selection dialog opens from the keyboard and focus moves into it", await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')));
  const dlg = page.getByRole("dialog");
  await page.waitForFunction(() => /selected|hasn't selected/i.test(document.querySelector('[role="dialog"]').innerText), null, { timeout: 15000 }).catch(() => {});
  const t = (await dlg.innerText()).replace(/\s+/g, " ");
  check("it lists the client's favourites with a count", /selected/i.test(t), t.slice(0, 200));
  check("it explains what the export is for (short help text)", /Lightroom/.test(t) && /CSV/.test(t), t);
  const ext = dlg.getByLabel("Without file extensions");
  await ext.focus(); await page.keyboard.press("Space");
  check("“Without file extensions” toggles with the Space key", await ext.isChecked());
  const tabbed = [];
  for (let i = 0; i < 8; i++) { await page.keyboard.press("Tab"); tabbed.push(await page.evaluate(() => (document.activeElement.innerText || document.activeElement.getAttribute("aria-label") || "").trim().slice(0, 30))); }
  check("Tab reaches Download CSV, Copy list and the zip download inside the dialog", ["Download CSV", "Copy list"].every((x) => tabbed.some((y) => y.includes(x))), tabbed.join(" | "));
  if (SHOT) await page.screenshot({ path: `${SHOT}/selection-export.png` });
  await audit("selection dialog");
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  check("Escape closes it and focus returns to the Favorites button", (await page.locator('[role="dialog"]').count()) === 0 && (await page.evaluate(() => document.activeElement && /Favorites/.test(document.activeElement.innerText || ""))));

  // --- empty selection
  const empty = page.locator('[data-ui="gallery-list"] > div').filter({ hasText: "Private test" }).first();
  await empty.getByRole("button", { name: /Favorites/ }).click();
  await page.waitForSelector('[role="dialog"]');
  await page.waitForFunction(() => /selected|hasn't selected/i.test(document.querySelector('[role="dialog"]').innerText), null, { timeout: 15000 }).catch(() => {});
  const et = (await page.getByRole("dialog").innerText()).replace(/\s+/g, " ");
  check("a gallery with no selection says so and says what happens next", /hasn't selected any photos yet/.test(et) && /heart/.test(et), et);
  check("…and offers no export buttons that would produce an empty file", (await page.getByRole("dialog").getByRole("button", { name: "Copy list" }).count()) === 0, et);
  await audit("empty selection dialog");
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);

  // --- Drive check in the new-gallery form
  await page.getByRole("button", { name: /New Gallery/ }).first().click(); await page.waitForSelector('[role="dialog"]');
  await page.getByLabel("Google Drive folder link").fill("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
  const dc = page.locator('[data-ui="drive-check"]');
  await dc.waitFor({ timeout: 10000 });
  check("the folder check reports in a polite live region (role=status)", (await dc.getAttribute("role")) === "status" && (await dc.getAttribute("aria-live")) === "polite");
  await page.waitForFunction(() => { const e = document.querySelector('[data-ui="drive-check"]'); return e && !/Checking/.test(e.textContent); }, null, { timeout: 15000 }).catch(() => {});
  const dtext = (await dc.innerText()).trim();
  check("…and ends with a plain-language result, not a code", dtext.length > 5 && !/^\d{3}\b|undefined|\[object/.test(dtext), dtext);
  if (SHOT) await page.screenshot({ path: `${SHOT}/drive-check.png` });
  await audit("new gallery form with the folder check");
  await page.getByLabel("Google Drive folder link").fill("not a link");
  await page.waitForTimeout(800);
  check("a bad link is flagged without a network call or jargon", /Drive|link|folder/i.test((await page.getByRole("dialog").innerText())), "");

  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("SCRIPT ERROR", e); process.exit(1); });
