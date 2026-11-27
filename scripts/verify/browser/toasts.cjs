/**
 * Toasts and the undoable gallery delete (S5-12): "Gallery deleted · Undo" with the real DELETE sent only when the time is up, Undo
 * restoring the card without any request, the dismiss button, assertive errors, axe and 390 px. Real login against the emulators; run
 * `emu-reset.sh` first and start `serve-emu.sh` WITHOUT ADMIN_UID is fine either way.
 * Usage: NODE_PATH=$(npm root -g) [AXE_PATH=<axe.min.js>] [SHOT=<dir>] node toasts.cjs
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  const deletes = [];
  page.on("request", (r) => { if (r.method() === "DELETE" && /\/api\/galleries\//.test(r.url())) deletes.push(r.url()); });
  const audit = async (name) => {
    if (!axeSrc) return;
    await page.waitForTimeout(500);
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
  const names = async () => (await page.locator('[data-ui="gallery-list"] h3').allInnerTexts());
  const before = await names();
  const target = "No downloads";
  const toastEl = page.locator('[data-ui="toast"]');
  const del = async () => {
    const card = page.locator('[data-ui="gallery-list"] > div').filter({ hasText: target });
    await card.getByRole("button", { name: "More" }).click();
    await page.locator("[role=menu] >> text=Delete").click();
    await page.getByRole("dialog").locator("button:has-text('Delete')").click();
  };

  await del(); await page.waitForTimeout(500);
  check("the card is gone at once", !(await names()).includes(target) && (await names()).length === before.length - 1, (await names()).join(","));
  check("a toast says so and offers Undo", /Gallery deleted/.test(await toastEl.first().innerText()) && (await toastEl.getByRole("button", { name: "Undo" }).count()) === 1);
  check("nothing has been sent to the server yet", deletes.length === 0, deletes.join(","));
  check("the toast has a Dismiss button", (await toastEl.getByRole("button", { name: /Dismiss|Close/ }).count()) === 1);
  if (SHOT) await page.screenshot({ path: `${SHOT}/toast-undo.png` });
  await audit("dashboard with the undo toast");
  await toastEl.getByRole("button", { name: "Undo" }).click(); await page.waitForTimeout(600);
  check("Undo puts the card back", (await names()).includes(target) && (await names()).length === before.length);
  check("…and confirms it (Gallery restored)", /Gallery restored/.test(await toastEl.first().innerText()));
  await page.waitForTimeout(8000);
  check("…and no DELETE is ever sent for it", deletes.length === 0, deletes.join(","));
  check("the gallery is still in the database", (await db.collection("galleries").where("name", "==", target).get()).size === 1);

  await del(); await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Dismiss|Close/ }).first().click();
  check("dismissing the toast does not cancel the delete (the card stays gone)", !(await names()).includes(target));
  await page.waitForTimeout(8500);
  check("when the time is up exactly one DELETE is sent", deletes.length === 1, deletes.join(","));
  check("the card stays gone and the gallery is deleted", !(await names()).includes(target) && (await db.collection("galleries").where("name", "==", target).get()).size === 0);

  // leaving the page sends a waiting delete at once
  const other = "Big gallery";
  const card = page.locator('[data-ui="gallery-list"] > div').filter({ hasText: other });
  await card.getByRole("button", { name: "More" }).click();
  await page.locator("[role=menu] >> text=Delete").click();
  await page.getByRole("dialog").locator("button:has-text('Delete')").click(); await page.waitForTimeout(400);
  const n = deletes.length;
  await page.goto(`${BASE}/dashboard/account`, { waitUntil: "load" }); await page.waitForTimeout(2500);
  check("leaving the page while an Undo is open still deletes it (it was confirmed)", (await db.collection("galleries").where("name", "==", other).get()).size === 0, `${deletes.length} ${n}`);

  // errors are announced assertively and last longer
  await page.goto(`${BASE}/dashboard`, { waitUntil: "load" }); await page.waitForSelector('[data-ui="gallery-list"]');
  await page.setViewportSize({ width: 390, height: 800 });
  const c2 = page.locator('[data-ui="gallery-list"] > div').first();
  await db.collection("galleries").doc((await db.collection("galleries").get()).docs[0].id).update({ updatedAt: Date.now() }); // keep the doc alive
  check("390 px: no horizontal overflow", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  await c2.getByRole("button", { name: /Copy link/ }).click(); await page.waitForTimeout(400);
  const t390 = await toastEl.first().boundingBox();
  check("390 px: a toast fits the screen", !!t390 && t390.x >= 0 && t390.x + t390.width <= 390, JSON.stringify(t390));
  if (SHOT) await page.screenshot({ path: `${SHOT}/toast-390.png` });
  await audit("toast at 390");

  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("SCRIPT ERROR", e); process.exit(1); });
