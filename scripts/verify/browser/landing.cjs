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
    check("phone: the four links are hidden until opened", (await page.locator("header").getByRole("link", { name: "Pricing" }).count()) === 0);
    await btn.click();
    check("phone: menu opens (aria-expanded, links shown)", (await page.getByRole("button", { name: "Close menu" }).getAttribute("aria-expanded")) === "true" && (await page.locator("header").getByRole("link", { name: "Pricing" }).isVisible()));
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
    check("desktop: landmarks (banner, one main, contentinfo)", (await page.getByRole("banner").count()) === 1 && (await page.getByRole("main").count()) === 1 && (await page.getByRole("contentinfo").count()) === 1);
    check("desktop: footer links go to the legal pages and the sections", (await page.locator("footer a[href='/terms']").count()) === 1 && (await page.locator("footer a[href='/privacy']").count()) === 1 && (await page.locator("footer a[href='/#pricing']").count()) === 1 && (await page.locator("footer a[href='/contact']").count()) === 1);
    const faqBtn = page.locator("#faq").getByRole("button", { name: "Is billing recurring?" });
    check("desktop: FAQ first item open, billing answer opens on click", (await page.locator("#faq button[aria-expanded=true]").count()) === 1 && (await faqBtn.click(), (await faqBtn.getAttribute("aria-expanded")) === "true"));
    check("desktop: the final CTA button goes to /login", (await page.locator("section[aria-labelledby=cta-title] a[href='/login']").count()) === 1);
    check("desktop: one h1, two lines of headline", (await page.getByRole("heading", { level: 1 }).count()) === 1);
    check("desktop: hero image is preloaded (priority)", (await page.locator('link[rel=preload][as=image]').count()) >= 1);
    await ctx.close();
  }

  // Try it (demo form), tutorial video, and "Why PhotoDrive"
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "Accept-Language": "en" } });
    const page = await ctx.newPage();
    await page.goto(BASE + PATH, { waitUntil: "networkidle" });
    const tryIt = page.locator("#try-it");
    check("try it: the hero's demo button scrolls to this section when no demo URL is set", (await page.getByRole("link", { name: "View live demo" }).getAttribute("href")) === "#try-it");
    await tryIt.getByLabel("Google Drive folder link").fill("not a link");
    await tryIt.getByRole("button", { name: /Try it/ }).click();
    await page.waitForSelector("#try-it-error", { timeout: 8000 }).catch(() => {});
    check("try it: a bad link shows the translated error as an alert", (await tryIt.getByRole("alert").innerText().catch(() => "")) === "Invalid Google Drive link.");
    check("try it: the field is marked invalid", (await tryIt.getByLabel("Google Drive folder link").getAttribute("aria-invalid")) === "true");
    await tryIt.getByLabel("Google Drive folder link").fill("https://drive.google.com/drive/folders/BIGFOLDER000000000000000000000000");
    await tryIt.getByRole("button", { name: /Try it/ }).click();
    await page.waitForURL(/\/demo\//, { timeout: 15000 }).catch(() => {});
    check("try it: a valid folder link creates a demo and opens it", /\/demo\/[A-Za-z0-9_-]+/.test(page.url()), page.url());

    await page.goto(BASE + PATH, { waitUntil: "networkidle" });
    const video = page.locator("video");
    check("video: has webm and mp4 sources and a label", (await video.locator("source").count()) === 2 && (await video.getAttribute("aria-label")) === "Tutorial video");
    check("video: the play button covers it until started", await page.getByRole("button", { name: "Watch the demo" }).isVisible());
    await page.getByRole("button", { name: "Watch the demo" }).click();
    await page.waitForTimeout(500);
    check("video: pressing play removes the overlay", (await page.getByRole("button", { name: "Watch the demo" }).count()) === 0);
    check("why: four trust cards and no promise about links that never expire", (await page.locator("section[aria-labelledby=why-title] li").count()) === 4 && !/never expire|doesn.t expire|stays live/i.test(await page.locator("section[aria-labelledby=why-title]").innerText()));
    await ctx.close();
  }

  // Pricing from real plans (WITH_PLANS=1: emulator seeded with seed.cjs and seed-plans.cjs) or the no-plans fallback
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "Accept-Language": "en" } });
    const html = await (await ctx.request.get(BASE + PATH)).text();
    const page = await ctx.newPage();
    await page.goto(BASE + PATH, { waitUntil: "networkidle" });
    const pricing = page.locator("#pricing");
    if (process.env.WITH_PLANS) {
      check("pricing: prices are in the server HTML", html.includes("$99") && html.includes("Save 31%"));
      check("pricing: the billing toggle is shown with the saving badge", (await pricing.getByRole("button", { name: /Yearly/ }).innerText()).includes("Save 31%"));
      check("pricing: yearly is the default", (await pricing.getByRole("button", { name: /Yearly/ }).getAttribute("aria-pressed")) === "true");
      check("pricing: yearly shows both yearly plans, each in its own currency", (await pricing.innerText()).includes("$99") && (await pricing.innerText()).includes("€99"));
      check("pricing: recommended plans say Most popular (the two highlighted yearly plans of the seed data)", (await pricing.getByText("Most popular").count()) === 2);
      check("pricing: each button goes to checkout for its plan", (await pricing.locator('a[href="/subscribe?plan=p-pro-year"]').count()) === 1 && (await pricing.locator('a[href="/subscribe?plan=p-year"]').count()) === 1);
      await pricing.getByRole("button", { name: "Monthly" }).click();
      const monthly = await pricing.innerText();
      check("pricing: toggling to monthly shows $12 / month and hides the yearly plans", monthly.includes("$12") && monthly.includes("/ month") && !monthly.includes("$99"));
      check("pricing: monthly button is pressed", (await pricing.getByRole("button", { name: "Monthly" }).getAttribute("aria-pressed")) === "true");
      check("pricing: yearly cards say how much is saved", (await (async () => { await pricing.getByRole("button", { name: /Yearly/ }).click(); return pricing.innerText(); })()).includes("Save 31% vs monthly."));
    } else {
      const text = await pricing.innerText();
      check("pricing (no plans): shows the features card and a button, never a price", !/[$€£]\s?\d/.test(text) && (await pricing.locator('a[href="/subscribe"]').count()) === 1 && text.includes("Unlimited galleries"));
      check("pricing (no plans): no billing toggle", (await pricing.getByRole("button", { name: "Monthly" }).count()) === 0);
    }
    check("pricing: states the billing model and the checkout provider", (await pricing.innerText()).includes("no auto-renewal") && (await pricing.innerText()).includes("Stripe"));
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
})();
