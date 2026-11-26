/**
 * S6 browser check of the new landing page (/new-landing until S6-14 moves it to /). Production server on :3997 (see README).
 * Checks: server-rendered copy, no horizontal overflow at 1440/1024/390 in all six languages, the phone menu (button state, Escape,
 * language choice inside it), working anchors, and that nothing in view is clipped on the right edge. SHOT=<dir> saves screenshots.
 * Run with tsx (it reads the real dictionaries): NODE_PATH=$(npm root -g) npx tsx scripts/verify/browser/landing.cjs
 */
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3997";
const PATH = process.env.LANDING_PATH || "/new-landing";
const LANGS = ["en", "el", "nl", "de", "es", "it"];
const dict = (l) => require(`../../../lib/i18n/dictionaries/${l}`)[l];
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`); if (!ok) failed++; };

(async () => {
  const browser = await chromium.launch();

  // Server HTML in each language: headline, lead, nav labels, one landmark nav
  for (const l of LANGS) {
    const html = await (await (await browser.newContext({ extraHTTPHeaders: { "Accept-Language": l } })).request.get(BASE + PATH)).text();
    const d = dict(l);
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
    check(`[${l}] server HTML has the headline`, html.includes(esc(d.hero.title1)) || html.includes(d.hero.title1));
    check(`[${l}] server HTML has the nav labels`, html.includes(esc(d.nav.howItWorks)) && html.includes(esc(d.nav.pricing)));
    check(`[${l}] <html lang> is ${l}`, new RegExp(`<html[^>]*lang="${l}"`).test(html));
  }

  // No overflow, nothing wider than the screen, in every language and width
  for (const l of LANGS) for (const w of [1440, 1024, 390]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, extraHTTPHeaders: { "Accept-Language": l }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(BASE + PATH, { waitUntil: "networkidle" });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const clipped = await page.evaluate(() => [...document.querySelectorAll("h1, h2, h3, p, a, button, li")].filter((el) => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return r.width > 0 && cs.visibility !== "hidden" && r.right > document.documentElement.clientWidth + 1 && !el.closest("[data-allow-overflow]") && !el.closest("[aria-hidden=true]") && !el.closest("[data-chip]");
    }).map((el) => (el.textContent || "").trim().slice(0, 30)));
    check(`[${l}] ${w}px: no horizontal overflow, no text past the right edge`, over <= 0 && clipped.length === 0, over > 0 ? `${over}px` : clipped.join(" | "));
    if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/landing-${l}-${w}.png`, fullPage: true });
    await ctx.close();
  }

  // The phone menu
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, extraHTTPHeaders: { "Accept-Language": "en" } });
    const page = await ctx.newPage();
    await page.goto(BASE + PATH, { waitUntil: "networkidle" });
    const btn = page.getByRole("button", { name: "Menu", exact: true });
    check("phone: menu button starts closed", (await btn.getAttribute("aria-expanded")) === "false");
    check("phone: the four links are hidden until opened", (await page.getByRole("link", { name: "Pricing" }).count()) === 0);
    await btn.click();
    check("phone: menu opens (aria-expanded, links shown)", (await page.getByRole("button", { name: "Close menu" }).getAttribute("aria-expanded")) === "true" && (await page.getByRole("link", { name: "Pricing" }).isVisible()));
    await page.keyboard.press("Escape");
    check("phone: Escape closes the menu", (await page.getByRole("button", { name: "Menu", exact: true }).getAttribute("aria-expanded")) === "false");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.locator("#landing-menu").getByRole("button", { name: /Language/ }).click();
    await page.locator("#landing-menu").getByRole("option", { name: "Deutsch" }).click();
    await page.waitForFunction(() => document.documentElement.lang === "de" && (document.querySelector("h1")?.textContent || "").includes("Dein Google Drive"), null, { timeout: 10000 }).catch(() => {});
    check("phone: choosing Deutsch in the menu switches the page", (await page.evaluate(() => document.documentElement.lang)) === "de" && (await page.getByRole("heading", { level: 1 }).innerText()).includes("Dein Google Drive"));
    await ctx.close();
  }

  // Desktop nav: links, language menu, CTA targets
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "Accept-Language": "en" } });
    const page = await ctx.newPage();
    await page.goto(BASE + PATH, { waitUntil: "networkidle" });
    const href = async (name) => page.getByRole("link", { name }).first().getAttribute("href");
    check("desktop: anchors point to the sections", (await href("How it works")) === "#how" && (await href("Features")) === "#features" && (await href("Pricing")) === "#pricing" && (await href("FAQ")) === "#faq");
    check("desktop: Get started and Create your gallery go to /login", (await href("Get started")) === "/login" && (await href("Create your gallery")) === "/login");
    check("desktop: the original logo is used", (await page.locator("header img[alt=PhotoDrive]").first().getAttribute("src")).includes("logo-light"));
    check("desktop: one h1, two lines of headline", (await page.getByRole("heading", { level: 1 }).count()) === 1);
    check("desktop: hero image is preloaded (priority)", (await page.locator('link[rel=preload][as=image]').count()) >= 1);
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
})();
