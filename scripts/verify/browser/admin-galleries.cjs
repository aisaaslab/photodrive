/**
 * Browser check of the admin Galleries screen and the public "not available" page (S7-06), production build on the emulators.
 * Setup as for admin-users.cjs (emu-reset.sh, seed-users.cjs, serve-emu.sh with ADMIN_UID=photographer1).
 *   NODE_PATH=$(npm root -g) [AXE_PATH=<axe.min.js>] [SHOT=<dir>] node scripts/verify/browser/admin-galleries.cjs
 */
const { chromium } = require("playwright");
const fs = require("fs");
const BASE = process.env.BASE ?? "http://localhost:3997";
const SHOT = process.env.SHOT;
let failed = 0;
const ok = (c, msg) => { console.log(`${c ? "PASS" : "FAIL"} ${msg}`); if (!c) failed++; };
async function audit(page, name) {
  if (!process.env.AXE_PATH) return;
  await page.addScriptTag({ content: fs.readFileSync(process.env.AXE_PATH, "utf8") });
  const r = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  const bad = r.violations.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes.slice(0, 2).map((n) => n.target.join(" ").slice(0, 70)).join("; ")}`);
  ok(bad.length === 0, `axe ${name}${bad.length ? ": " + bad.join(" | ") : ""}`);
}
async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.fill("input[type=email]", "photographer@example.com");
  await page.fill("input[type=password]", "test-password-1");
  await page.locator("label:has(input[type=checkbox])").first().click({ position: { x: 8, y: 8 } });
  await page.click("button:has-text('Sign in'):not(:has-text('Google'))");
  await page.waitForURL(/dashboard/);
}
const rows = (page) => page.locator('[data-ui="gallery-row"]');
const settle = async (page) => { await page.waitForTimeout(600); await page.waitForFunction(() => document.querySelector('[data-ui="galleries-list"]')?.getAttribute("aria-busy") === "false"); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await login(page);
  await page.goto(`${BASE}/dashboard/admin/galleries`, { waitUntil: "load" });
  await page.waitForSelector('[data-ui="gallery-row"]'); await settle(page);

  ok((await rows(page).count()) === 25, "first page shows 25 galleries");
  ok(/6[0-9] galleries/.test(await page.locator("main").innerText()), "header shows the real total");
  ok(await page.getByRole("link", { name: "Galleries" }).first().isVisible(), "Galleries is in the admin navigation");
  if (SHOT) await page.screenshot({ path: `${SHOT}/admin-galleries-1440.png` });
  await audit(page, "list 1440");
  await page.getByRole("button", { name: "Load more" }).click(); await page.waitForTimeout(700);
  ok((await rows(page).count()) === 50, "Load more appends the next 25");

  await page.fill("#gallery-search", "KELLER"); await page.waitForTimeout(1200); await settle(page);
  ok((await rows(page).count()) === 1 && /Keller wedding/.test(await rows(page).first().innerText()) && /Anna Keller/.test(await rows(page).first().innerText()), "search by link finds the gallery and shows its owner");
  await page.fill("#gallery-search", "zzz"); await page.waitForTimeout(1200); await settle(page);
  ok(await page.getByText(/No gallery with a link starting/).isVisible(), "an empty search says so");
  await page.fill("#gallery-search", "keller-wedding"); await page.waitForTimeout(1200); await settle(page);

  // the public page works before
  const visitor = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" })).newPage();
  await visitor.goto(`${BASE}/gallery/keller-wedding`, { waitUntil: "load" });
  ok((await visitor.locator("h1").first().innerText()).includes("Keller wedding"), "before: the public gallery opens");

  // switch off with a reason
  await rows(page).first().getByRole("button", { name: "Switch off" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel(/Reason/).fill("Copyright complaint");
  await page.waitForTimeout(500);
  if (SHOT) await page.screenshot({ path: `${SHOT}/admin-galleries-confirm-1440.png` });
  await audit(page, "confirm dialog");
  await dlg.getByRole("button", { name: "Switch off" }).click();
  await page.getByText(/is now switched off/).waitFor();
  await settle(page);
  ok(/Switched off/.test(await rows(page).first().innerText()) && /Copyright complaint/.test(await rows(page).first().innerText()), "the row shows it is switched off, since when and why");

  // visitors
  await visitor.goto(`${BASE}/gallery/keller-wedding`, { waitUntil: "load" });
  ok(await visitor.getByRole("heading", { name: "This gallery is not available" }).isVisible(), "after: the visitor sees the polite page");
  ok((await visitor.locator('[data-ui="gallery-unavailable"]').innerText()).includes("get in touch with the photographer"), "it tells them what to do, without saying why");
  ok(!(await visitor.content()).includes("Keller wedding"), "the gallery's name and photos are not in the page at all");
  const crawled = await (await visitor.request.get(`${BASE}/gallery/keller-wedding`, { headers: { "user-agent": "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)" } })).text();
  const head = crawled.slice(0, crawled.indexOf("</head>"));
  ok(/<meta name="robots" content="noindex, nofollow"/.test(head), "a crawler that reads only the HTML (Bing) is told, in the page head, not to index it");
  if (SHOT) await visitor.screenshot({ path: `${SHOT}/gallery-unavailable-1280.png` });
  await audit(visitor, "unavailable page");
  const greek = await (await browser.newContext({ viewport: { width: 390, height: 800 }, reducedMotion: "reduce" })).newPage();
  await greek.context().addCookies([{ name: "lang", value: "de", url: BASE }]);
  await greek.goto(`${BASE}/gallery/keller-wedding`, { waitUntil: "load" });
  const de = await greek.getByRole("heading", { name: "Diese Galerie ist nicht verfügbar" }).waitFor({ timeout: 8000 }).then(() => true, () => false);
  ok(de, "a German visitor sees it in German");
  ok(await greek.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal scroll at 390");
  if (SHOT) await greek.screenshot({ path: `${SHOT}/gallery-unavailable-de-390.png` });
  const status = await visitor.evaluate(async () => (await fetch("/api/galleries/ga1/selection")).status);
  ok(status === 404, "its favourites endpoint answers 404 too");

  // filter and switch back on
  await page.getByRole("button", { name: /Switched off/ }).click(); await page.waitForTimeout(900); await settle(page);
  ok((await rows(page).count()) === 1, "the Switched off filter lists only the switched-off gallery");
  await rows(page).first().getByRole("button", { name: "Switch on" }).click();
  await page.getByText(/is back on/).waitFor(); await settle(page);
  ok((await rows(page).count()) === 0 && await page.getByText(/Nothing is switched off|No gallery with a link starting/).isVisible(), "switching it on removes it from that list");
  await visitor.goto(`${BASE}/gallery/keller-wedding`, { waitUntil: "load" });
  ok((await visitor.locator("h1").first().innerText()).includes("Keller wedding"), "the visitor can open it again, exactly as before");

  // owner link goes to Users with the search filled in
  await page.getByRole("button", { name: "All" }).click(); await page.fill("#gallery-search", "keller-wedding"); await page.waitForTimeout(1200); await settle(page);
  await rows(page).first().getByRole("link", { name: /Anna Keller/ }).click();
  await page.waitForURL(/dashboard\/admin\/users\?q=/);
  await page.waitForSelector('[data-ui="user-row"]');
  ok((await page.locator("#user-search").inputValue()) === "anna@example.com" && (await page.locator('[data-ui="user-row"]').count()) === 1, "the owner link opens Users already searched for that person");

  // phone
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })).newPage(); await login(m);
  await m.goto(`${BASE}/dashboard/admin/galleries`, { waitUntil: "load" }); await m.waitForSelector('[data-ui="gallery-row"]'); await m.waitForTimeout(800);
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "list: no horizontal scroll at 390");
  if (SHOT) await m.screenshot({ path: `${SHOT}/admin-galleries-390.png` });
  await audit(m, "list 390");

  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exit(failed ? 1 : 0);
})();
