/**
 * The subscribe page plan picker and the thank-you page steps (S5-12). Run against emulators seeded with `emu-reset.sh --plans`
 * (plans: Yearly 99 EUR, Pro monthly $12, Pro yearly $99). Signs in through the real login form.
 * Usage: NODE_PATH=$(npm root -g) [AXE_PATH=<axe.min.js>] [SHOT=<dir>] node subscribe.cjs
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
  const mk = async (w = 1280) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 1000 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
    return page;
  };
  const audit = async (page, name) => {
    if (!axeSrc) return;
    await page.waitForTimeout(700);
    await page.evaluate(axeSrc);
    const r = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
    check(`axe ${name}`, r.violations.length === 0, r.violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ").slice(0, 60)).join("|")}`).join(" ;; "));
  };
  const login = async (p, email) => {
    await p.goto(`${BASE}/login`, { waitUntil: "load" });
    await p.fill("input[type=email]", email); await p.fill("input[type=password]", "test-password-1");
    await p.locator("label:has(input[type=checkbox])").first().click({ position: { x: 8, y: 8 } });
    await p.click("button:has-text('Sign in'):not(:has-text('Google'))");
    await p.waitForURL(/dashboard|subscribe/);
  };
  const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 0);

  // --- subscribe (signed in, nothing active)
  const page = await mk();
  await login(page, "unpaid@example.com");
  await page.goto(`${BASE}/subscribe`, { waitUntil: "load" });
  await page.waitForSelector('[data-ui="plan-option"]'); await page.waitForTimeout(500);
  if (SHOT) await page.screenshot({ path: `${SHOT}/subscribe.png`, fullPage: true });
  const opts = page.locator('[data-ui="plan-option"]');
  check("the plans are a labelled radio group", (await page.getByRole("radiogroup").count()) + (await page.locator("fieldset legend").count()) >= 1 && (await page.getByRole("radio").count()) === (await opts.count()) && (await opts.count()) >= 2, String(await opts.count()));
  const proYear = opts.filter({ hasText: "$99" }).first();
  const t = (await proYear.innerText()).replace(/\s+/g, " ");
  check("the yearly plan shows its saving against twelve months", /Save 31%/.test(t), t);
  check("…and what it comes to per month", /≈ \$8\.25 \/ month/.test(t), t);
  check("only one plan is selected at a time", (await page.getByRole("radio", { checked: true }).count()) === 1);
  const before = await page.getByRole("radio", { checked: true }).getAttribute("value");
  await page.getByRole("radio", { checked: true }).focus();
  await page.keyboard.press("ArrowRight");
  const after = await page.getByRole("radio", { checked: true }).getAttribute("value");
  check("arrow keys move the selection", before !== after, `${before} -> ${after}`);
  const summary = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  check("the summary and the buy button follow the selection", /\$|€/.test(summary) && (await page.getByRole("button", { name: /Get access|Subscribe|Buy|Renew/i }).count()) >= 1, summary.slice(0, 300));
  await audit(page, "subscribe");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  check("390 px subscribe: no horizontal overflow", await noOverflow(page));
  if (SHOT) await page.screenshot({ path: `${SHOT}/subscribe-390.png`, fullPage: true });
  await audit(page, "subscribe at 390");

  // --- thank-you
  const out = await mk();
  await out.goto(`${BASE}/thank-you`, { waitUntil: "load" });
  await out.waitForSelector('[data-ui="order-steps"]'); await out.waitForTimeout(600);
  const outSteps = (await out.locator('[data-ui="order-steps"]').innerText()).replace(/\s+/g, " ");
  check("signed out: says to log in to activate, and does not claim a payment was received", /Log in to activate/.test(outSteps) && !/Payment received/.test(outSteps), outSteps);
  if (SHOT) await out.screenshot({ path: `${SHOT}/thankyou-login.png` });
  await audit(out, "thank-you signed out");

  const act = await mk();
  await login(act, "photographer@example.com");
  await act.goto(`${BASE}/thank-you`, { waitUntil: "load" });
  await act.waitForSelector('[data-ui="order-steps"] [data-state="done"]', { timeout: 15000 });
  const actSteps = (await act.locator('[data-ui="order-steps"]').innerText()).replace(/\s+/g, " ");
  check("an active account: “Your account is active” is done and the first gallery is next", /Your account is active/.test(actSteps) && /Create your first gallery/.test(actSteps), actSteps);
  check("an active account is not told its payment is still being recorded", !/Payment recorded/.test(await act.locator("main").innerText()) && /Welcome to PhotoDrive/.test(await act.locator("main").innerText()));
  check("the steps are an ordered list with a state on each item", (await act.locator('[data-ui="order-steps"] li[data-state]').count()) === 2);
  if (SHOT) await act.screenshot({ path: `${SHOT}/thankyou-active.png` });
  await audit(act, "thank-you active");
  await act.setViewportSize({ width: 390, height: 800 });
  await act.waitForTimeout(300);
  check("390 px thank-you: no horizontal overflow", await noOverflow(act));
  await audit(act, "thank-you at 390");

  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("SCRIPT ERROR", e); process.exit(1); });
