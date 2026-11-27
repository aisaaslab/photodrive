/**
 * Browser check of the admin Users screen (S7-05) against a production build on the emulators.
 * Setup: emu-reset.sh, seed-users.cjs (1,200 bulk profiles + 5 named people), serve-emu.sh with ADMIN_UID=photographer1 (the seeded photographer becomes the administrator).
 *   NODE_PATH=$(npm root -g) [AXE_PATH=<axe.min.js>] [SHOT=<dir>] node scripts/verify/browser/admin-users.cjs
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
const rows = (page) => page.locator('[data-ui="user-row"]');
const settle = async (page) => { await page.waitForTimeout(500); await page.waitForFunction(() => document.querySelector('[data-ui="users-list"]')?.getAttribute("aria-busy") === "false"); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await login(page);
  await page.goto(`${BASE}/dashboard/admin/users`, { waitUntil: "load" });
  await page.waitForSelector('[data-ui="user-row"]');
  await settle(page);

  ok((await rows(page).count()) === 25, "first page shows 25 people");
  ok(/1,207 accounts/.test(await page.locator("main, body").first().innerText()), "header counts every account (1,207), not a capped 1,000");
  ok(await page.getByText(/accounts? (is|are) missing from this list/).isVisible(), "profiles without an e-mail index are called out");
  if (SHOT) await page.screenshot({ path: `${SHOT}/admin-users-1440.png` });
  await audit(page, "list 1440");

  await page.getByRole("button", { name: "Load more" }).click(); await page.waitForTimeout(800);
  ok((await rows(page).count()) === 50, "Load more appends the next 25");
  let more = 0; while (await page.getByRole("button", { name: "Load more" }).count() && more < 60) { await page.getByRole("button", { name: "Load more" }).click(); await page.waitForTimeout(250); more++; }
  const everyone = await rows(page).count();
  ok(everyone >= 1205 && everyone <= 1206, `paging to the end reaches every searchable profile (got ${everyone}; 1,205 seeded, plus the administrator whose sign-in wrote its own e-mail index)`);
  ok(await page.getByText(/end of list/).isVisible(), "the end of the list is announced");

  // search
  await page.fill("#user-search", "BULK0100"); await page.waitForTimeout(1200); await settle(page);
  ok((await rows(page).count()) === 1 && /bulk0100@example.com/i.test(await rows(page).first().innerText()), "search by e-mail prefix, any case, finds exactly one person");
  await page.fill("#user-search", "nobody-here"); await page.waitForTimeout(1200); await settle(page);
  ok(await page.getByText(/No one with an e-mail starting/).isVisible(), "an empty search says so");
  await page.fill("#user-search", ""); await page.waitForTimeout(1200); await settle(page);

  // filters
  const names = async () => page.locator('[data-ui="user-name"]').allInnerTexts();
  await page.getByRole("button", { name: "Expiring in 30 days" }).click(); await page.waitForTimeout(900); await settle(page);
  ok(JSON.stringify(await names()) === JSON.stringify(["Ben Okafor"]), "Expiring shows only the person ending within 30 days (lifetime is not listed)");
  await page.getByRole("button", { name: "Lapsed" }).click(); await page.waitForTimeout(900); await settle(page);
  ok(JSON.stringify(await names()) === JSON.stringify(["Dev Patel"]), "Lapsed shows only the person whose access ended");
  await page.getByRole("button", { name: "Complimentary" }).click(); await page.waitForTimeout(900); await settle(page);
  ok(JSON.stringify(await names()) === JSON.stringify(["Carla Reyes"]), "Complimentary shows only the comped person");
  await page.getByRole("button", { name: "Active" }).click(); await page.waitForTimeout(900); await settle(page);
  const act = await names();
  ok(["Ben Okafor", "Anna Keller", "Carla Reyes"].every((n) => act.includes(n)) && !act.includes("Dev Patel") && !act.includes("Elena Rossi"), `Active lists people with running access only (${act.join(", ")})`);
  await page.getByRole("button", { name: "Everyone" }).click(); await page.waitForTimeout(900); await settle(page);

  // drawer: Anna
  await page.fill("#user-search", "anna@"); await page.waitForTimeout(1200); await settle(page);
  await rows(page).first().click();
  const drawer = page.getByRole("dialog");
  await drawer.getByText("Keller wedding").waitFor();
  ok(await drawer.getByText("Yearly (yearly)").isVisible(), "drawer shows the plan");
  ok(await drawer.getByText("$99.00").first().isVisible(), "drawer lists the payment");
  ok((await drawer.getByText("Private", { exact: true }).count()) === 1 && (await drawer.getByText("Studio portraits").count()) === 1, "drawer lists both galleries with their visibility");
  await page.waitForTimeout(800);
  if (SHOT) await page.screenshot({ path: `${SHOT}/admin-users-drawer-1440.png` });
  await audit(page, "drawer 1440");
  await drawer.getByRole("button", { name: "+1 year" }).click();
  await drawer.getByText("One more year of access granted.").waitFor();
  await drawer.getByText("+1 year granted").waitFor();
  ok(true, "+1 year works, shows a message, and appears under what administrators did");
  // edit a gallery
  await drawer.getByRole("button", { name: "Edit Keller wedding" }).click();
  await drawer.getByLabel("Name").first().fill("Keller wedding 2026");
  await drawer.getByRole("button", { name: "Save" }).click();
  await drawer.getByText("Keller wedding 2026").waitFor();
  ok(true, "a gallery can be renamed from the drawer");
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  ok((await page.getByRole("dialog").count()) === 0, "Escape closes the drawer");
  ok(await page.evaluate(() => document.activeElement?.getAttribute("data-ui") === "user-row"), "focus returns to the row that opened it");

  // drawer: Ben has a refunded payment to review
  await page.fill("#user-search", "ben@"); await page.waitForTimeout(1200); await settle(page);
  ok(/Refunded/.test(await rows(page).first().innerText()), "the row flags a refunded payment");
  await rows(page).first().click();
  const d2 = page.getByRole("dialog");
  await d2.getByRole("button", { name: "Mark reviewed" }).click();
  await d2.getByRole("button", { name: "Mark reviewed" }).waitFor({ state: "detached" });
  ok(true, "Mark reviewed clears the review flag");
  await page.keyboard.press("Escape");

  // delete needs the typed e-mail
  await page.fill("#user-search", "bulk0001@"); await page.waitForTimeout(1200); await settle(page);
  await rows(page).first().click();
  const d3 = page.getByRole("dialog");
  const del = d3.getByRole("button", { name: "Delete permanently" });
  await del.waitFor();
  ok(await del.isDisabled(), "Delete is disabled until the e-mail is typed");
  await d3.getByLabel("Type the e-mail address to confirm").fill("wrong@example.com");
  ok(await del.isDisabled(), "a wrong e-mail does not enable Delete");
  await d3.getByLabel("Type the e-mail address to confirm").fill("bulk0001@example.com");
  await del.click(); await page.waitForTimeout(1200);
  ok((await page.getByRole("dialog").count()) === 0 && (await rows(page).count()) === 0, "deleting removes the person and closes the drawer");

  // phone
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const mp = await m.newPage(); await login(mp);
  await mp.goto(`${BASE}/dashboard/admin/users`, { waitUntil: "load" }); await mp.waitForSelector('[data-ui="user-row"]'); await mp.waitForTimeout(800);
  ok(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal scroll at 390");
  if (SHOT) await mp.screenshot({ path: `${SHOT}/admin-users-390.png` });
  await audit(mp, "list 390");
  await mp.locator('[data-ui="user-row"]').first().click(); await mp.getByRole("dialog").waitFor(); await mp.waitForTimeout(800);
  ok(await mp.evaluate(() => { const d = document.querySelector('[role="dialog"]'); return d.scrollWidth <= d.clientWidth + 1; }), "drawer fits a phone");
  if (SHOT) await mp.screenshot({ path: `${SHOT}/admin-users-drawer-390.png` });
  await audit(mp, "drawer 390");

  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exit(failed ? 1 : 0);
})();
