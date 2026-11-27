/**
 * The admin Plans and Promo codes screens (S8-03) in a real browser: the plan editor with its live preview and warnings, prices in each
 * plan's own currency, saving a plan and seeing the landing page change (its cached pricing is warmed first, so this proves the cache is
 * expired on save), showing/hiding/deleting, errors surfaced when the server refuses, the audit trail, promo code rules, 390 px and
 * accessibility. Signs in through the real login form against the emulators.
 * Setup: scripts/verify/browser/emu-reset.sh --plans, then serve with ADMIN_UID=photographer1 scripts/verify/browser/serve-emu.sh
 * Usage: NODE_PATH=$(npm root -g) [AXE_PATH=<axe.min.js>] [SHOT=<dir>] node plans.cjs
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.env.BASE || "http://localhost:3997";
const SHOT = process.env.SHOT;
const axeSrc = process.env.AXE_PATH ? fs.readFileSync(process.env.AXE_PATH, "utf8") : null;
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const admin = require(path.join(process.cwd(), "node_modules/firebase-admin"));
admin.initializeApp({ projectId: "demo-photodrive" });
const db = admin.firestore();
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " :: " + String(extra).slice(0, 300)}`); if (!ok) failed++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  const login = async (p, email) => {
    await p.goto(`${BASE}/login`, { waitUntil: "load" });
    await p.fill("input[type=email]", email); await p.fill("input[type=password]", "test-password-1");
    await p.locator("label:has(input[type=checkbox])").first().click({ position: { x: 8, y: 8 } });
    await p.click("button:has-text('Sign in'):not(:has-text('Google'))");
    await p.waitForURL(/dashboard/);
  };
  const audit = async (name) => {
    if (!axeSrc) return;
    await page.waitForTimeout(900);
    await page.evaluate(axeSrc);
    const r = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
    check(`axe ${name}`, r.violations.length === 0, r.violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ").slice(0, 60)).join("|")}`).join(" ;; "));
  };
  const settle = () => page.waitForTimeout(600);
  const trail = async () => (await db.collection("audit_log").get()).docs.map((d) => d.data()).sort((a, b) => a.at - b.at);
  const pricing = async () => { await page.goto(`${BASE}/new-landing`, { waitUntil: "load" }); return (await page.locator("#pricing").innerText()).replace(/\s+/g, " "); };
  const editor = () => page.locator('[data-ui="plan-editor"]');
  const preview = async () => (await editor().locator('[data-ui="plan-preview"]').innerText()).replace(/\s+/g, " ");
  const card = (name) => page.locator('[data-ui="plan-card"]').filter({ has: page.getByRole("heading", { name, exact: true }) });
  const toastText = () => page.locator("body").innerText();

  await login(page, "photographer@example.com"); // the administrator (ADMIN_UID=photographer1)

  // warm the landing page's cached pricing
  const before = await pricing();
  check("before: the landing pricing shows the seeded Pro plan and no Studio plan", /pro/i.test(before) && !/studio/i.test(before), before.slice(0, 200));

  // ---- the Plans screen ----
  await page.goto(`${BASE}/dashboard/admin/plans`, { waitUntil: "load" });
  await page.waitForSelector('[data-ui="plan-card"]'); await settle();
  if (SHOT) await page.screenshot({ path: `${SHOT}/plans.png`, fullPage: true });
  check("grouped by what customers see: 3 plans on the landing page", /Customers see 3 plans/.test(await page.locator('[data-ui="plans-summary"]').innerText()) && (await page.locator('[data-ui="plan-card"]').count()) === 3, await page.locator('[data-ui="plans-summary"]').innerText());
  check("each plan shows its price in its own currency (Yearly €99, Pro $99, Pro $12)", /€99/.test(await card("Yearly").innerText()) && (await card("Pro").locator('[data-ui="plan-price"]').allInnerTexts()).sort().join() === "$12,$99", await card("Pro").locator('[data-ui="plan-price"]').allInnerTexts());
  await audit("plans list");

  // ---- the editor: validation, currencies, preview, warnings ----
  await page.locator('[data-ui="plan-new"]').click();
  await editor().waitFor();
  check("preview waits for a valid price", /Enter a valid price to see the preview/.test(await preview()));
  await editor().locator("#plan-name").fill("Studio");
  await editor().locator("#plan-price").fill("12.345");
  check("USD refuses a third decimal as you type, and the preview stays empty", /allows at most 2 decimals/.test(await editor().innerText()) && /Enter a valid price/.test(await preview()));
  await editor().locator("#plan-price").fill("0.10");
  check("a price below Stripe's usual minimum is warned about, not blocked", /below the smallest amount Stripe/.test(await editor().locator('[data-ui="plan-warnings"]').innerText()));
  await editor().locator("#plan-currency").selectOption("jpy");
  await editor().locator("#plan-price").fill("4800.5");
  check("yen have no decimals", /no decimals/.test(await editor().innerText()));
  await editor().locator("#plan-price").fill("4800");
  await page.waitForTimeout(300);
  check("a yen plan previews as ¥4,800 (whole yen, not ×100)", /¥4,800/.test(await preview()), await preview());
  await editor().locator("#plan-currency").selectOption("eur");
  await editor().locator("#plan-price").fill("149");
  await page.waitForTimeout(300);
  check("the preview is the real pricing section: the new plan appears next to the live ones, in euros", /studio/i.test(await preview()) && /€149/.test(await preview()) && /\$99/.test(await preview()), await preview());
  check("the price hint says what customers pay and for how long", /Customers pay €149\.00 once for 365 days/.test(await editor().innerText()), (await editor().innerText()).replace(/\s+/g, " ").slice(0, 600));
  await editor().locator("#plan-name").fill("Pro");
  await page.waitForTimeout(300);
  check("a second public plan with the same name and period is flagged (they pair by name)", /already called “Pro” with yearly billing/.test(await editor().locator('[data-ui="plan-warnings"]').innerText()));
  await editor().locator("#plan-currency").selectOption("usd");
  await editor().locator("#plan-price").fill("149");
  await editor().getByRole("radio", { name: "Monthly" }).click();
  await editor().locator("#plan-price").fill("15");
  await editor().locator("#plan-name").fill("Pro");
  await editor().getByRole("radio", { name: "Yearly" }).click();
  await editor().locator("#plan-price").fill("79");
  await page.waitForTimeout(300);
  await audit("plan editor with preview");
  if (SHOT) await page.screenshot({ path: `${SHOT}/plan-editor.png` });
  await page.keyboard.press("Escape"); await settle();
  check("closing without saving creates nothing", (await db.collection("plans").get()).size === 3);

  // pairing and the saving badge: edit the seeded yearly Pro and watch the preview
  await card("Pro").filter({ hasText: "Yearly · 365" }).locator('[data-ui="plan-edit"]').click();
  await editor().waitFor();
  check("editing shows the stored price in the box and keeps the plan's currency", (await editor().locator("#plan-price").inputValue()) === "99" && (await editor().locator("#plan-currency").inputValue()) === "usd");
  check("the preview pairs it with Pro monthly and shows the real saving (31 %)", /Save 31%/.test(await preview()), await preview());
  await page.keyboard.press("Escape"); await settle();

  // ---- create a plan, and the landing page changes ----
  await page.locator('[data-ui="plan-new"]').click();
  await editor().locator("#plan-name").fill("Studio");
  await editor().locator("#plan-currency").selectOption("eur");
  await editor().locator("#plan-price").fill("149");
  await editor().locator("#plan-description").fill("For busy studios");
  await editor().locator("#plan-features").fill("Unlimited galleries\nTeam seats");
  await editor().locator('[data-ui="plan-save"]').click();
  await page.waitForSelector('[data-ui="plan-card"][data-plan="Studio"]');
  check("saved: a toast says the landing page now shows it", /Plan created\. The pricing section on the landing page now shows it\./.test(await toastText()));
  const studio = await db.collection("plans").where("name", "==", "Studio").get();
  check("stored in euro cents, with its currency", studio.size === 1 && studio.docs[0].get("priceCents") === 14900 && studio.docs[0].get("currency") === "eur", JSON.stringify(studio.docs[0]?.data()));
  const after = await pricing();
  check("the landing page now shows Studio at €149 (its cached pricing was expired on save)", /studio/i.test(after) && /€149/.test(after), after.slice(0, 300));

  // ---- edit: price changes, currency kept, landing follows ----
  await page.goto(`${BASE}/dashboard/admin/plans`, { waitUntil: "load" }); await page.waitForSelector('[data-ui="plan-card"][data-plan="Studio"]');
  await card("Studio").locator('[data-ui="plan-edit"]').click();
  await editor().waitFor();
  check("editing keeps the euro", (await editor().locator("#plan-currency").inputValue()) === "eur" && (await editor().locator("#plan-price").inputValue()) === "149");
  await editor().locator("#plan-price").fill("159");
  await editor().locator('[data-ui="plan-save"]').click();
  await page.waitForFunction(() => /€159/.test(document.querySelector('[data-ui="plan-card"][data-plan="Studio"]')?.textContent ?? ""));
  check("the landing page shows the new price at once", /€159/.test(await pricing()));

  // ---- hide, show, deactivate ----
  await page.goto(`${BASE}/dashboard/admin/plans`, { waitUntil: "load" }); await page.waitForSelector('[data-ui="plan-card"][data-plan="Studio"]');
  await card("Studio").locator('[data-ui="plan-visibility"]').click();
  await page.waitForFunction(() => /not on the landing page/i.test(document.body.innerText));
  check("hiding moves it to “Not on the landing page” and tells you", /hidden from the landing page/.test(await toastText()));
  check("and the landing page no longer shows it", !/studio/i.test(await pricing()));
  await page.goto(`${BASE}/dashboard/admin/plans`, { waitUntil: "load" }); await page.waitForSelector('[data-ui="plan-card"][data-plan="Studio"]');
  await card("Studio").locator('[data-ui="plan-visibility"]').click();
  await page.waitForFunction(() => !/not on the landing page/i.test(document.body.innerText));
  check("showing it again brings it back", /studio/i.test(await pricing()));

  // ---- an error from the server is shown, not swallowed ----
  await db.collection("plans").doc("p-ghost").set({ name: "Ghost", description: "", interval: "monthly", priceCents: 500, currency: "usd", features: [], isPublic: true, active: true, highlight: false, sortOrder: 9, createdAt: Date.now(), updatedAt: Date.now() });
  await page.goto(`${BASE}/dashboard/admin/plans`, { waitUntil: "load" }); await page.waitForSelector('[data-ui="plan-card"][data-plan="Ghost"]');
  await db.collection("plans").doc("p-ghost").delete();
  await card("Ghost").locator('[data-ui="plan-active"]').click();
  await page.getByText("Plan not found").first().waitFor({ timeout: 5000 });
  check("when the server refuses (the plan is gone) the error is shown", true);

  // ---- delete asks first, then the landing page changes ----
  await page.goto(`${BASE}/dashboard/admin/plans`, { waitUntil: "load" }); await page.waitForSelector('[data-ui="plan-card"][data-plan="Studio"]');
  await card("Studio").locator('[data-ui="plan-delete"]').click();
  check("delete asks first and says what happens to people who have it", /People who already have it keep their access/.test(await page.locator('[data-ui="plan-delete-confirm"]').innerText()));
  await audit("delete confirmation");
  await page.locator('[data-ui="plan-delete-yes"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-ui="plan-card"][data-plan="Studio"]'));
  check("deleted: gone from the list, the database and the landing page", (await db.collection("plans").where("name", "==", "Studio").get()).empty && !/studio/i.test(await pricing()));

  // ---- the audit trail ----
  const acts = (await trail()).filter((a) => a.targetType === "plan").map((a) => a.action);
  check("every plan change is audited under the administrator: create, update, toggle ×2, delete", acts.join(",") === "plan.create,plan.update,plan.toggle,plan.toggle,plan.delete" && (await trail()).every((a) => a.actorUid === "photographer1"), acts.join(","));

  // ---- promo codes ----
  await db.collection("payments").doc("cs_w1").set({ uid: "x", amountTotal: 0, promoCode: "WILD", activatedAt: Date.now(), sessionId: "cs_w1" });
  await page.goto(`${BASE}/dashboard/admin/promo-codes`, { waitUntil: "load" });
  await page.waitForSelector('[data-ui="promo-form"]'); await settle();
  if (SHOT) await page.screenshot({ path: `${SHOT}/promo-codes.png`, fullPage: true });
  check("a code used for a free signup but with no rule is offered", /WILD/.test(await page.locator('[data-ui="promo-unmanaged"]').innerText()) && /1 used/.test(await page.locator('[data-ui="promo-unmanaged"]').innerText()));
  await audit("promo codes");
  await page.fill("#pc-code", "x");
  check("a bad code is flagged as you type", /Use 2–40 letters/.test(await page.locator('[data-ui="promo-form"]').innerText()));
  await page.fill("#pc-code", "free year");
  await page.fill("#pc-days", "0");
  check("a bad length is flagged", /from 1 to 3650/.test(await page.locator('[data-ui="promo-form"]').innerText()));
  await page.getByRole("button", { name: "1 year", exact: true }).click();
  await page.locator('[data-ui="promo-add"]').click();
  await page.waitForSelector('[data-ui="promo-rule"][data-code="FREEYEAR"]');
  check("added: code tidied to FREEYEAR, 1 year · 365 days", /1 year/.test(await page.locator('[data-ui="promo-rule"][data-code="FREEYEAR"]').innerText()) && /Rule added: FREEYEAR gives 1 year/.test(await toastText()));
  await page.fill("#pc-code", "FREEYEAR");
  check("a duplicate is refused as you type", /already exists/.test(await page.locator('[data-ui="promo-form"]').innerText()));
  await page.fill("#pc-code", "");
  await page.locator('[data-ui="promo-unmanaged"] button').first().click();
  check("clicking an unmanaged code fills the form", (await page.inputValue("#pc-code")) === "WILD", `value=${JSON.stringify(await page.inputValue("#pc-code"))} chips=${await page.locator('[data-ui="promo-unmanaged"]').innerText()}`);
  await page.getByRole("button", { name: "3 months", exact: true }).click();
  await page.locator('[data-ui="promo-add"]').click();
  await page.waitForSelector('[data-ui="promo-rule"][data-code="WILD"]');
  check("the new rule counts the redemption it already had, and the code left the unmanaged list", /1 redemption/.test(await page.locator('[data-ui="promo-rule"][data-code="WILD"]').innerText()) && (await page.locator('[data-ui="promo-unmanaged"]').count()) === 0);
  await page.locator('[data-ui="promo-rule"][data-code="WILD"]').getByRole("switch").click();
  await page.waitForFunction(() => /WILD is off/.test(document.body.innerText));
  check("turning a rule off says what then happens", (await db.collection("promoCodes").doc("WILD").get()).get("active") === false);
  await page.locator('[data-ui="promo-rule"][data-code="FREEYEAR"] [data-ui="promo-edit"]').click();
  await page.fill("#edit-days-FREEYEAR", "730"); await page.fill("#edit-note-FREEYEAR", "launch");
  await page.locator('[data-ui="promo-save"]').click();
  await page.waitForFunction(() => /FREEYEAR now gives 2 years/.test(document.body.innerText));
  check("editing the length and note is stored", (await db.collection("promoCodes").doc("FREEYEAR").get()).get("accessDays") === 730);
  await page.locator('[data-ui="promo-rule"][data-code="WILD"] [data-ui="promo-delete"]').click();
  check("deleting asks first", /get the length of the plan they pick instead/.test(await page.locator('[data-ui="promo-delete-confirm"]').innerText()));
  await audit("promo delete confirmation");
  await page.locator('[data-ui="promo-delete-yes"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-ui="promo-rule"][data-code="WILD"]'));
  const pacts = (await trail()).filter((a) => a.targetType === "promoCode").map((a) => `${a.action}:${a.targetId}`);
  check("promo changes are audited", pacts.join(",") === "promo.create:FREEYEAR,promo.create:WILD,promo.update:WILD,promo.update:FREEYEAR,promo.delete:WILD", pacts.join(","));

  // ---- a phone, and a customer ----
  await page.setViewportSize({ width: 390, height: 900 });
  for (const p of ["plans", "promo-codes"]) {
    await page.goto(`${BASE}/dashboard/admin/${p}`, { waitUntil: "load" }); await settle();
    check(`390 px: ${p} has no horizontal overflow`, (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  }
  await page.goto(`${BASE}/dashboard/admin/plans`, { waitUntil: "load" }); await page.waitForSelector('[data-ui="plan-card"]');
  await page.locator('[data-ui="plan-new"]').click(); await editor().waitFor();
  await editor().locator("#plan-price").fill("49"); await settle();
  check("390 px: the editor and its preview have no horizontal overflow", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  if (SHOT) await page.screenshot({ path: `${SHOT}/plan-editor-390.png` });
  await audit("plan editor at 390");

  const other = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await other.newPage();
  await p2.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await login(p2, "unpaid@example.com");
  for (const p of ["plans", "promo-codes"]) { await p2.goto(`${BASE}/dashboard/admin/${p}`, { waitUntil: "load" }); await p2.waitForTimeout(1200); check(`a customer is sent away from ${p}`, !/\/admin\//.test(p2.url()), p2.url()); }

  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("SCRIPT ERROR", e); process.exit(1); });
