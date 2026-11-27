/**
 * The billing page (S9-02) in a real browser: every plan state, with lapse enforcement on or off, in English and German at 390 px.
 * Signs in through the real login form against the emulators and puts the seeded photographer into each state by writing the user
 * document. Run twice, once per server setting: ENFORCED=1 against a server started with GALLERY_LAPSE_ENFORCE=1 (and
 * REMINDERS_MODE=send BILLING_FULFIL_V2=1), ENFORCED=0 against the plain one. Usage: NODE_PATH=$(npm root -g) ENFORCED=1 node billing.cjs
 * (reset and reseed the emulators first; set AXE_PATH=<axe.min.js> for an accessibility audit, SHOT=<dir> for screenshots).
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.env.BASE || "http://localhost:3997";
const ENFORCED = process.env.ENFORCED === "1";
const SHOT = process.env.SHOT;
// The two server setups go together: the enforced one also has BILLING_FULFIL_V2=1 (early renewal), the plain one does not.
const EARLY = ENFORCED;
const axeSrc = process.env.AXE_PATH ? fs.readFileSync(process.env.AXE_PATH, "utf8") : null;
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const admin = require(path.join(process.cwd(), "node_modules/firebase-admin"));
admin.initializeApp({ projectId: "demo-photodrive" });
const db = admin.firestore();
const DAY = 86_400_000;
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " " + extra}`); if (!ok) failed++; };

async function setPlan(fields) {
  const del = admin.firestore.FieldValue.delete();
  await db.collection("users").doc("photographer1").set({
    subscriptionExpiresAt: del, subscriptionStatus: del, compGranted: del, planName: del, planInterval: del, ...fields,
  }, { merge: true });
}

const STATES = [
  { state: "none", plan: {}, msg: /do not have a plan yet/, button: "Subscribe" },
  { state: "active", plan: { subscriptionStatus: "active", subscriptionExpiresAt: Date.now() + 200 * DAY, planName: "Yearly", planInterval: "yearly" }, msg: /plan is active/, button: "Renew early" },
  { state: "expiring", plan: { subscriptionStatus: "active", subscriptionExpiresAt: Date.now() + 5 * DAY, planName: "Monthly", planInterval: "monthly" }, msg: /ends soon/, button: "Renew early" },
  { state: "comped", plan: { subscriptionStatus: "active", subscriptionExpiresAt: Date.now() + 90 * DAY, compGranted: true, planName: "Studio" }, msg: /granted you this access/, button: "Renew early" },
  { state: "lifetime", plan: { subscriptionStatus: "active", subscriptionExpiresAt: 32503680000000, planName: "Founder" }, msg: /lifetime access/, button: null },
  ENFORCED
    ? { state: "grace", plan: { subscriptionStatus: "expired", subscriptionExpiresAt: Date.now() - 3 * DAY, planName: "Yearly", planInterval: "yearly" }, msg: /galleries stay online until/, button: "Renew" }
    : { state: "lapsed", plan: { subscriptionStatus: "expired", subscriptionExpiresAt: Date.now() - 3 * DAY, planName: "Yearly", planInterval: "yearly" }, msg: /stay online and nothing is deleted, but you need an active plan/, button: "Renew" },
  { state: "lapsed", plan: { subscriptionStatus: "expired", subscriptionExpiresAt: Date.now() - 30 * DAY, planName: "Yearly", planInterval: "yearly" }, msg: ENFORCED ? /offline for visitors\. Nothing was deleted/ : /stay online and nothing is deleted, but you need an active plan/, button: "Renew", suffix: "-long" },
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.fill("input[type=email]", "photographer@example.com");
  await page.fill("input[type=password]", "test-password-1");
  await page.locator("label:has(input[type=checkbox])").first().click({ position: { x: 8, y: 8 } });
  await page.click("button:has-text('Sign in'):not(:has-text('Google'))");
  await page.waitForURL(/dashboard/);

  const audit = async (name) => {
    if (!axeSrc) return;
    await page.waitForTimeout(900); // let the page's fade-in finish: axe would measure colours half-way through it
    await page.evaluate(axeSrc);
    const r = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
    check(`axe ${name}`, r.violations.length === 0, r.violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes.slice(0, 4).map((n) => `${n.target.join(" ").slice(0, 70)} [${(n.any[0] && n.any[0].message || "").slice(0, 110)}]`).join(" | ")}`).join(" ;; "));
  };

  for (const s of STATES) {
    await setPlan(s.plan);
    await page.goto(`${BASE}/dashboard/billing`, { waitUntil: "load" });
    await page.waitForSelector('[data-ui="billing-status"]', { timeout: 15000 });
    const name = `${s.state}${s.suffix || ""} (${ENFORCED ? "enforced" : "not enforced"})`;
    const text = (sel) => page.locator(sel).first().innerText().catch(() => "");
    check(`${name}: status state`, (await page.locator('[data-ui="billing-status"]').getAttribute("data-state")) === s.state, await text('[data-ui="billing-status"]'));
    check(`${name}: message`, s.msg.test(await text('[data-ui="billing-message"]')), await text('[data-ui="billing-message"]'));
    const renew = page.locator('[data-ui="billing-renew"]');
    const wantsButton = s.button && (s.button !== "Renew early" || EARLY);
    if (s.button === "Renew early" && !EARLY) check(`${name}: no button, only the "renew once your plan has ended" hint`, (await renew.count()) === 0 && /renew once your plan has ended/.test(await page.locator('[data-ui="billing-plan"]').innerText()));
    else if (wantsButton) check(`${name}: button "${s.button}" to /subscribe`, (await renew.count()) === 1 && (await renew.innerText()).trim() === s.button && (await renew.getAttribute("href")) === "/subscribe", await renew.allInnerTexts());
    else check(`${name}: no button`, (await renew.count()) === 0);
    const lapse = page.locator('[data-ui="billing-lapse"]');
    if (s.state === "lifetime") check(`${name}: no lapse block`, (await lapse.count()) === 0);
    else {
      const t = await lapse.innerText();
      check(`${name}: lapse block states what really happens`, ENFORCED ? /14 more days/.test(t) && /temporarily unavailable/.test(t) && /Nothing is ever deleted/.test(t) : /stay online and nothing is deleted/.test(t) && /cannot create new galleries/.test(t) && !/temporarily unavailable/.test(t), t);
      check(`${name}: reminders line only when reminders are on and the plan is running`, /14 days and 3 days/.test(t) === (ENFORCED && ["active", "expiring"].includes(s.state)), t);
    }
    if (["active", "grace", "lapsed", "none"].includes(s.state) && !s.suffix) { if (SHOT) await page.screenshot({ path: `${SHOT}/billing-${s.state}.png`, fullPage: true }); await audit(name); }
  }

  // Dates are US English, the payment list is on the page, and Account links here.
  await setPlan({ subscriptionStatus: "active", subscriptionExpiresAt: Date.UTC(2027, 0, 5, 12), planName: "Yearly", planInterval: "yearly" });
  await page.goto(`${BASE}/dashboard/billing`, { waitUntil: "load" });
  await page.waitForSelector('[data-ui="billing-status"]');
  check("dates read as US English (January 5, 2027)", /January 5, 2027/.test(await page.locator('[data-ui="billing-plan"]').innerText()), await page.locator('[data-ui="billing-plan"]').innerText());
  check("payment history is on the page", (await page.getByText(/Payment history/).count()) === 1);
  await page.goto(`${BASE}/dashboard/account`, { waitUntil: "load" });
  await page.waitForSelector('[data-ui="account-billing-link"]');
  await page.locator('[data-ui="account-billing-link"]').click();
  await page.waitForURL(/\/dashboard\/billing/);
  check("Account links to the billing page", true);

  // German on a phone: long words must not overflow.
  await page.setViewportSize({ width: 390, height: 900 });
  await setPlan({ subscriptionStatus: "expired", subscriptionExpiresAt: Date.now() - 3 * DAY, planName: "Jahresplan", planInterval: "yearly" });
  await ctx.addCookies([{ name: "lang", value: "de", url: BASE }]);
  await page.evaluate(() => { try { localStorage.setItem("lang", "de"); } catch {} });
  await page.goto(`${BASE}/dashboard/billing`, { waitUntil: "load" });
  await page.waitForSelector('[data-ui="billing-status"]');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("German at 390 px: no horizontal overflow", overflow <= 0, String(overflow));
  const heading = await page.locator("h1").innerText();
  check("German at 390 px: page is in German", /Abrechnung/.test(heading), heading);
  if (SHOT) await page.screenshot({ path: `${SHOT}/billing-de-390.png`, fullPage: true });
  await audit("German 390");

  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})();
