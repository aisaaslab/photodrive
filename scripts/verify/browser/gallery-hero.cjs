/**
 * The client gallery's hero and header (S5-12): the title appearing in the sticky header after the hero scrolls away, the "View photos"
 * cue, the skip link, 390 px and axe. Against emulators seeded by emu-reset.sh (public gallery "pubtest"); the server must be started with
 * serve-emu.sh (it uses the fake Drive). Usage: NODE_PATH=$(npm root -g) [AXE_PATH=<axe.min.js>] [SHOT=<dir>] node gallery-hero.cjs
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  const audit = async (name) => {
    if (!axeSrc) return;
    await page.waitForTimeout(800);
    await page.evaluate(axeSrc);
    const r = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
    check(`axe ${name}`, r.violations.length === 0, r.violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ").slice(0, 60)).join("|")}`).join(" ;; "));
  };
  const title = page.locator('[data-ui="header-title"]');
  await page.goto(`${BASE}/gallery/pubtest`, { waitUntil: "load" });
  await page.waitForSelector("#photos"); await page.waitForTimeout(800);
  { const v = await title.getAttribute("data-visible"); check("at the top the header shows no extra title (the hero has it)", v === "false", String(v) + " " + JSON.stringify(await page.evaluate(() => [scrollY, document.getElementById("gallery-hero").getBoundingClientRect().bottom, innerHeight]))); }
  check("the page has exactly one h1, in the hero", (await page.locator("h1").count()) === 1 && /Public test/.test(await page.locator("h1").innerText()));
  const cue = page.getByRole("link", { name: "View photos" });
  check("a “View photos” cue is in the hero", (await cue.count()) === 1);
  if (SHOT) await page.screenshot({ path: `${SHOT}/hero.png` });
  await audit("gallery top");

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to photos" });
  check("the first Tab lands on a visible “Skip to photos” link", await skip.evaluate((e) => e === document.activeElement && e.getBoundingClientRect().width > 20));
  await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  check("it moves focus to the photos area", await page.evaluate(() => location.hash === "#photos" && document.activeElement && document.activeElement.id === "photos"));

  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  await cue.click(); await page.waitForTimeout(500);
  const top = await page.evaluate(() => document.getElementById("photos").getBoundingClientRect().top);
  check("the cue scrolls the photos up under the header", top >= 0 && top < 200, String(top));
  check("…and now the header shows the gallery's name", (await title.getAttribute("data-visible")) === "true" && /Public test/.test(await title.innerText()));
  if (SHOT) await page.screenshot({ path: `${SHOT}/hero-scrolled.png` });
  await audit("gallery scrolled");
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
  { const v = await title.getAttribute("data-visible"); check("back at the top the header title is hidden again", v === "false", String(v)); }

  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(400);
  check("390 px: no horizontal overflow", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  const cueBox = await cue.boundingBox(); const avatar = await page.locator("#gallery-hero + div img, #gallery-hero + div [class*=rounded-pill]").first().boundingBox();
  check("390 px: the cue does not run into the photographer's avatar", !!cueBox && !!avatar && cueBox.y + cueBox.height <= avatar.y + 2, JSON.stringify([cueBox, avatar]));
  if (SHOT) await page.screenshot({ path: `${SHOT}/hero-390.png` });
  await audit("gallery at 390");
  await page.evaluate(() => window.scrollTo(0, 900)); await page.waitForTimeout(400);
  const t = await title.boundingBox();
  check("390 px: the header title fits between the logo and the language button", !!t && t.width > 40 && (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, JSON.stringify(t));
  if (SHOT) await page.screenshot({ path: `${SHOT}/hero-scrolled-390.png` });
  await audit("gallery scrolled at 390");

  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("SCRIPT ERROR", e); process.exit(1); });
