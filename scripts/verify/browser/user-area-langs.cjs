/**
 * Long-text check of the user area (S5-12): German, Greek and Dutch strings run 20-30% longer than English. Visits the main screens at 390 px
 * in each language (the `lang` cookie, as a visitor's choice would set it) and fails on horizontal overflow or text past the right edge.
 * Reset and reseed the emulators first. Usage: SHOT=<dir> node user-area-langs.cjs
 */
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3997";
const LANGS = ["de", "el", "nl", "es", "it"];
let failed = 0;
const overflow = (page) => page.evaluate(() => {
  const W = document.documentElement.clientWidth;
  const wide = [...document.querySelectorAll("h1,h2,h3,p,a,button,label,span,li")].filter((el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && cs.visibility !== "hidden" && r.right > W + 1 && !el.closest("[aria-hidden=true]") && !el.closest(".overflow-x-auto") && !el.closest("[data-allow-overflow]");
  }).map((el) => (el.textContent || "").trim().slice(0, 30));
  return { scroll: document.documentElement.scrollWidth - W, wide: [...new Set(wide)].slice(0, 4) };
});
async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.fill("input[type=email]", email); await page.fill("input[type=password]", "test-password-1");
  await page.locator("label:has(input[type=checkbox])").first().click({ position: { x: 8, y: 8 } });
  await page.click("button[type=submit]"); await page.waitForURL(/dashboard/);
}
(async () => {
  const browser = await chromium.launch();
  for (const lang of LANGS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce" });
    await ctx.addCookies([{ name: "lang", value: lang, url: BASE }]);
    const page = await ctx.newPage();
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
    const check = async (name) => {
      await page.waitForTimeout(700);
      const o = await overflow(page);
      const ok = o.scroll <= 0 && o.wide.length === 0;
      console.log(`${ok ? "PASS" : "FAIL"} [${lang}] ${name}${ok ? "" : ` (scroll ${o.scroll}px; ${o.wide.join(" | ")})`}`); if (!ok) failed++;
      if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/lang-${lang}-${name.replace(/\W+/g, "-")}.png` });
    };
    await page.goto(`${BASE}/login`, { waitUntil: "load" }); await check("login");
    await page.goto(`${BASE}/gallery/pubtest`, { waitUntil: "load" }); await check("client gallery");
    await page.goto(`${BASE}/gallery/privtest`, { waitUntil: "load" }); await check("password gate");
    await login(page, "photographer@example.com"); await page.waitForSelector('main button[aria-haspopup="menu"]'); await check("dashboard");
    await page.locator('main button[aria-haspopup="menu"]').first().click();
    await page.locator("[role=menu] [role=menuitem]").nth(3).click(); // Choose cover, e-mail, WhatsApp, then Edit
    await page.waitForSelector('[role="dialog"]'); await check("settings dialog");
    await page.keyboard.press("Escape");
    await page.goto(`${BASE}/dashboard/account`, { waitUntil: "load" }); await check("account");
    await ctx.close();
    const c2 = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce" });
    await c2.addCookies([{ name: "lang", value: lang, url: BASE }]);
    const p2 = await c2.newPage(); await p2.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
    await login(p2, "unpaid@example.com"); await p2.waitForTimeout(900);
    const o1 = await overflow(p2); const ok1 = o1.scroll <= 0 && o1.wide.length === 0;
    console.log(`${ok1 ? "PASS" : "FAIL"} [${lang}] empty dashboard${ok1 ? "" : ` (scroll ${o1.scroll}px; ${o1.wide.join(" | ")})`}`); if (!ok1) failed++;
    await p2.goto(`${BASE}/subscribe`, { waitUntil: "load" }); await p2.waitForTimeout(900);
    const o2 = await overflow(p2); const ok2 = o2.scroll <= 0 && o2.wide.length === 0;
    console.log(`${ok2 ? "PASS" : "FAIL"} [${lang}] subscribe${ok2 ? "" : ` (scroll ${o2.scroll}px; ${o2.wide.join(" | ")})`}`); if (!ok2) failed++;
    await c2.close();
  }
  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
})();
