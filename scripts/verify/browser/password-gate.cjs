/**
 * The client's password gate (S5-12), against emulators seeded by emu-reset.sh (private gallery "privtest", password hunter2).
 * Usage: NODE_PATH=$(npm root -g) [AXE_PATH=<axe.min.js>] [SHOT=<dir>] node password-gate.cjs
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  const audit = async (name) => {
    if (!axeSrc) return;
    await page.waitForTimeout(600);
    await page.evaluate(axeSrc);
    const r = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
    check(`axe ${name}`, r.violations.length === 0, r.violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ").slice(0, 60)).join("|")}`).join(" ;; "));
  };
  await page.goto(`${BASE}/gallery/privtest`, { waitUntil: "load" });
  const field = page.getByLabel("Password", { exact: true });
  await field.waitFor();
  check("the field has a real label and is focused on arrival", (await field.count()) === 1 && (await field.evaluate((e) => e === document.activeElement)));
  check("the gallery's name is the page heading", /Private test/.test(await page.getByRole("heading", { level: 1 }).innerText()));
  check("it says who shared it", /Shared by \S+/.test(await page.locator("main").innerText()), await page.locator("main").innerText());
  check("the password is hidden by default", (await field.getAttribute("type")) === "password");
  if (SHOT) await page.screenshot({ path: `${SHOT}/gate.png` });
  await audit("gate");

  await field.fill("hunter2");
  await page.getByRole("button", { name: "Show password" }).click();
  check("Show password reveals it, and the button says Hide password", (await field.getAttribute("type")) === "text" && (await page.getByRole("button", { name: "Hide password" }).getAttribute("aria-pressed")) === "true");
  await page.getByRole("button", { name: "Hide password" }).click();

  await field.fill("wrong-one");
  await page.getByRole("button", { name: "Enter" }).click();
  const err = page.locator("#gallery-password-error"); await err.waitFor();
  check("a wrong password is announced and the field is marked invalid", /Wrong password/.test(await err.innerText()) && (await err.getAttribute("role")) === "alert" && (await field.getAttribute("aria-invalid")) === "true");
  check("…the cursor is back in the field with the text selected, ready to retype", await field.evaluate((e) => e === document.activeElement && e.selectionStart === 0 && e.selectionEnd === e.value.length));
  if (SHOT) await page.screenshot({ path: `${SHOT}/gate-error.png` });
  await audit("gate with an error");
  await field.fill("x");
  check("typing again clears the error", (await err.count()) === 0);

  await page.setViewportSize({ width: 390, height: 800 });
  check("390 px: no horizontal overflow", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  if (SHOT) await page.screenshot({ path: `${SHOT}/gate-390.png` });
  await audit("gate at 390");

  await field.fill("hunter2");
  await field.press("Enter");
  await page.waitForSelector("text=Private test", { timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector("#gallery-password"), null, { timeout: 10000 });
  check("the right password (Enter key) opens the gallery", (await page.locator("#gallery-password").count()) === 0);

  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("SCRIPT ERROR", e); process.exit(1); });
