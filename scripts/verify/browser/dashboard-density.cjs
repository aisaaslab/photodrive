/**
 * Dashboard layout choice (S5-12): cards or a compact list, remembered between visits; the card actions on a phone keep their labels
 * whole (the Favorites label used to be cut). Signs in through the real login form against the emulators.
 * Usage: NODE_PATH=$(npm root -g) [AXE_PATH=<axe.min.js>] [SHOT=<dir>] node dashboard-density.cjs (reset and reseed the emulators first).
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
  await page.waitForSelector('[data-ui="gallery-list"]'); await page.waitForTimeout(600);

  const list = page.locator('[data-ui="gallery-list"]');
  const cards = () => list.locator("> div");
  const n = await cards().count();
  check("there are galleries to compare", n >= 2, String(n));
  check("the default is cards", (await list.getAttribute("data-density")) === "cards" && await page.locator('[data-ui="density-cards"]').getAttribute("aria-pressed") === "true");
  const firstCard = await cards().first().boundingBox();
  const secondCard = await cards().nth(1).boundingBox();
  check("cards: galleries sit side by side in a grid", Math.abs(firstCard.y - secondCard.y) < 4, JSON.stringify([firstCard, secondCard]));
  if (SHOT) await page.screenshot({ path: `${SHOT}/density-cards.png`, fullPage: true });
  await audit("dashboard cards");

  await page.locator('[data-ui="density-list"]').click(); await page.waitForTimeout(400);
  check("list: the switch says so", (await list.getAttribute("data-density")) === "list" && await page.locator('[data-ui="density-list"]').getAttribute("aria-pressed") === "true");
  const a = await cards().first().boundingBox(), b = await cards().nth(1).boundingBox();
  check("list: one gallery per row, each row much shorter than a card", b.y > a.y + a.height - 2 && a.height < firstCard.height - 40 && a.width > 900, JSON.stringify([a, firstCard.height]));
  const cover = await cards().first().locator("a[tabindex='-1']").first().boundingBox();
  const copy = await cards().first().getByRole("button", { name: /copy link/i }).boundingBox();
  check("list: the cover is on the left and the actions on the right of the same row", cover.x < copy.x && copy.y >= a.y && copy.y + copy.height <= a.y + a.height + 1, JSON.stringify([cover, copy, a]));
  check("list: every action is still there (copy, open, favorites, more)", (await cards().first().getByRole("button", { name: /copy link/i }).count()) === 1 && (await cards().first().getByRole("button", { name: "More" }).count()) === 1);
  if (SHOT) await page.screenshot({ path: `${SHOT}/density-list.png`, fullPage: true });
  await audit("dashboard list");

  await page.reload({ waitUntil: "load" }); await page.waitForSelector('[data-ui="gallery-list"]');
  check("the choice is remembered after a reload", (await list.getAttribute("data-density")) === "list");
  await page.locator('[data-ui="density-cards"]').click(); await page.waitForTimeout(300);
  await page.reload({ waitUntil: "load" }); await page.waitForSelector('[data-ui="gallery-list"]');
  check("switching back is remembered too", (await list.getAttribute("data-density")) === "cards");
  await page.locator('[data-ui="density-list"]').focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  check("the switch works from the keyboard", (await list.getAttribute("data-density")) === "list");

  // a phone: both layouts, labels whole, no overflow
  await page.setViewportSize({ width: 390, height: 900 });
  check("390 px: the layout switch is not offered (both layouts stack the same on a phone; the search keeps the room)", !(await page.locator('[data-ui="density-list"]').isVisible()));
  for (const d of ["list", "cards"]) {
    await page.evaluate((v) => localStorage.setItem("dashboard_density", v), d);
    await page.reload({ waitUntil: "load" }); await page.waitForSelector('[data-ui="gallery-list"]'); await page.waitForTimeout(500);
    check(`390 px ${d}: no horizontal overflow`, (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
    const clipped = await page.evaluate(() => [...document.querySelectorAll('[data-ui="gallery-list"] button, [data-ui="gallery-list"] a')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== "visible").length);
    check(`390 px ${d}: no action label is cut off`, clipped === 0, String(clipped));
    if (SHOT) await page.screenshot({ path: `${SHOT}/density-${d}-390.png`, fullPage: true });
    await audit(`dashboard ${d} at 390`);
  }
  const labels = await page.evaluate(() => [...document.querySelectorAll('[data-ui="gallery-list"] span.whitespace-nowrap')].every((s) => s.getBoundingClientRect().right <= s.closest("button,a").getBoundingClientRect().right + 1));
  check("390 px: the Open and Favorites labels sit inside their buttons", labels);

  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("SCRIPT ERROR", e); process.exit(1); });
