/**
 * S6-13 browser check of the /lp/* landing pages after the re-skin: same URLs and content, CTAs still go to /login and still report to
 * the data layer, the dark tokens are in use (no light-theme background left), and nothing overflows at 1440/1024/390.
 */
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3997";
const PAGES = [
  { path: "/lp/pixieset-alternative", lp: "pixieset-alternative", h1: "Looking for a Simpler", cta: ["nav", "hero", "mid", "final"] },
  { path: "/lp/google-drive-gallery", lp: "google-drive-gallery", h1: null, cta: ["nav", "hero", "final"] },
];
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`); if (!ok) failed++; };

(async () => {
  const browser = await chromium.launch();
  for (const pg of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const res = await page.goto(BASE + pg.path, { waitUntil: "networkidle" });
    check(`${pg.path}: loads (200)`, res.status() === 200, String(res.status()));
    check(`${pg.path}: dark canvas background`, (await page.locator("main").evaluate((el) => getComputedStyle(el).backgroundColor)) === "rgb(6, 8, 12)");
    const h1 = await page.getByRole("heading", { level: 1 }).innerText();
    check(`${pg.path}: one h1 with its original wording`, (await page.getByRole("heading", { level: 1 }).count()) === 1 && (pg.h1 ? h1.includes(pg.h1) : h1.length > 10), h1.replace(/\n/g, " ").slice(0, 50));
    for (const placement of pg.cta) check(`${pg.path}: CTA "${placement}" goes to /login`, (await page.locator(`a[data-cta=${placement}]`).first().getAttribute("href")) === "/login");
    await page.evaluate(() => { window.dataLayer = []; document.addEventListener("click", (e) => { if (e.target.closest("a")) e.preventDefault(); }, true); });
    await page.locator("a[data-cta=hero]").first().click();
    const events = await page.evaluate(() => window.dataLayer);
    check(`${pg.path}: a CTA click still reports lp_cta_click with the variant and placement`, events.some((e) => e.event === "lp_cta_click" && e.lp_variant === pg.lp && e.lp_placement === "hero"), JSON.stringify(events).slice(0, 100));
    const light = await page.evaluate(() => [...document.querySelectorAll("section, header, footer, div")].filter((el) => { const c = getComputedStyle(el).backgroundColor; return c === "rgb(255, 255, 255)" && el.getBoundingClientRect().width > 300 && el.getBoundingClientRect().height > 200; }).length);
    check(`${pg.path}: no large white (light-theme) panel left`, light === 0, String(light));
    check(`${pg.path}: original logo in the nav`, (await page.locator("header img").first().getAttribute("src")).includes("logo-light"));
    await ctx.close();
    for (const w of [1440, 1024, 390]) {
      const c = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: "reduce" });
      const p = await c.newPage(); await p.goto(BASE + pg.path, { waitUntil: "networkidle" });
      const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`${pg.path}: no horizontal overflow at ${w}px`, over <= 0, `${over}px`);
      if (process.env.SHOT) await p.screenshot({ path: `${process.env.SHOT}/lp-${pg.lp}-${w}.png`, fullPage: true });
      await c.close();
    }
  }
  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
})();
