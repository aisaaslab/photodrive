/**
 * The admin Payments screen (S8-01) in a real browser: totals per currency, the needs-attention queue, filters and search, the payment
 * drawer, and the three ways an operator resolves an item without leaving the page (credit a customer, re-sync, mark reviewed).
 * Signs in through the real login form against the emulators. Stripe is a small stand-in started by this script (the server is pointed
 * at it with STRIPE_API_BASE_URL). Start the server with:
 *   ADMIN_UID=photographer1 STRIPE_SECRET_KEY=sk_test_fake STRIPE_API_BASE_URL=http://127.0.0.1:12111 APP_ENV=local scripts/verify/browser/serve-emu.sh
 * Usage: NODE_PATH=$(npm root -g) node payments.cjs (reset and reseed the emulators first; AXE_PATH=<axe.min.js> for accessibility, SHOT=<dir> for screenshots).
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const BASE = process.env.BASE || "http://localhost:3997";
const SHOT = process.env.SHOT;
const axeSrc = process.env.AXE_PATH ? fs.readFileSync(process.env.AXE_PATH, "utf8") : null;
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const admin = require("./admin-compat.cjs");
const db = admin.firestore();
const DAY = 86_400_000;
const NOW = Date.now();
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " :: " + String(extra).slice(0, 300)}`); if (!ok) failed++; };

// ---- a stand-in for Stripe: only "retrieve a Checkout Session" ----
const SESSIONS = {
  cs_test_lost: { id: "cs_test_lost", object: "checkout.session", amount_total: 9900, currency: "usd", customer: null, customer_email: null, mode: "payment", metadata: { planId: "plan_m", interval: "monthly" }, payment_status: "paid", status: "complete", livemode: false },
  cs_test_p1: { id: "cs_test_p1", object: "checkout.session", amount_total: 9900, currency: "usd", customer: null, customer_email: null, mode: "payment", metadata: { uid: "cust1", planId: "plan_m", interval: "monthly" }, payment_status: "paid", status: "complete", livemode: false },
};
const stripe = http.createServer((req, res) => {
  const m = /\/v1\/checkout\/sessions\/([^/?]+)/.exec(req.url || "");
  const s = m && SESSIONS[m[1]];
  res.setHeader("content-type", "application/json");
  if (!s) { res.statusCode = 404; res.end(JSON.stringify({ error: { type: "invalid_request_error", code: "resource_missing", message: "No such checkout.session" } })); return; }
  res.end(JSON.stringify(s));
});

async function seed() {
  const put = (col, id, data) => db.collection(col).doc(id).set(data);
  for (const [uid, email, name] of [["cust1", "anna@example.com", "Anna"], ["cust2", "nikos@example.com", "Nikos"]]) await put("users", uid, { uid, email, emailLower: email, name, createdAt: NOW - 30 * DAY });
  const pay = (id, o) => put("payments", id, { sessionId: id, activatedAt: NOW - DAY, status: "fulfilled", source: "paid", livemode: false, ...o });
  await pay("cs_test_p1", { uid: "cust1", amountTotal: 9900, currency: "usd", paymentIntentId: "pi_test_p1", activatedAt: NOW - DAY, grantedMs: 30 * DAY, expiresAtAfter: NOW + 20 * DAY });
  await pay("cs_test_p2", { uid: "cust2", amountTotal: 8900, currency: "eur", activatedAt: NOW - 2 * DAY });
  await pay("cs_test_p3", { uid: "cust1", amountTotal: 1200, currency: "usd", status: "refunded", refundedAmount: 1200, activatedAt: NOW - 3 * DAY });
  await pay("cs_test_p4", { uid: "cust2", amountTotal: 9900, currency: "usd", status: "disputed", needsReview: true, reviewNote: "Dispute opened", activatedAt: NOW - 4 * DAY });
  await pay("cs_test_p5", { uid: "cust1", amountTotal: 0, currency: "usd", source: "free_code", promoCode: "FREE1", activatedAt: NOW - 5 * DAY });
  await put("stripe_events", "evt_un", { type: "checkout.session.completed", status: "needs_review", outcome: "unmatched_payment", sessionId: "cs_test_lost", receivedAt: NOW - 2 * DAY, lastAttemptAt: NOW - 2 * DAY, attempts: 1, livemode: false, error: "no user could be matched" });
  await put("stripe_events", "evt_pr", { type: "charge.refunded", status: "needs_review", outcome: "refund_partial_flagged", sessionId: "cs_test_p1", uid: "cust1", receivedAt: NOW - DAY, lastAttemptAt: NOW - DAY, attempts: 1, livemode: false });
}

(async () => {
  await new Promise((r) => stripe.listen(12111, "127.0.0.1", r));
  await seed();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, reducedMotion: "reduce" });
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
  const rows = () => page.locator('[data-ui="payment-row"]');
  const attentionCount = async () => (await page.locator('[data-ui="attention-event"], [data-ui="attention-payment"]').count());
  const settle = () => page.waitForTimeout(700);
  const chip = (name) => page.getByRole("group", { name: "Show" }).getByRole("button", { name, exact: true });

  await login(page, "photographer@example.com"); // the administrator (ADMIN_UID=photographer1)
  await page.goto(`${BASE}/dashboard/admin/payments`, { waitUntil: "load" });
  await page.waitForSelector('[data-ui="payment-row"]');
  await page.waitForSelector('[data-ui="total-card"]');
  await settle();
  if (SHOT) await page.screenshot({ path: `${SHOT}/payments.png`, fullPage: true });

  // totals per currency (last 30 days), never mixed
  const cards = await page.locator('[data-ui="total-card"]').evaluateAll((els) => els.map((e) => ({ c: e.getAttribute("data-currency"), t: e.innerText.replace(/\s+/g, " ") })));
  const usd = cards.find((c) => c.c === "usd"), eur = cards.find((c) => c.c === "eur");
  check("totals: USD card is net $198.00 over 3 payments with $12.00 refunded", !!usd && /\$198\.00/.test(usd.t) && /3 payments/.test(usd.t) && /\$12\.00 refunded/.test(usd.t), JSON.stringify(cards));
  check("totals: EUR card is its own, €89.00 over 1 payment", !!eur && /€89\.00/.test(eur.t) && /1 payment/.test(eur.t), JSON.stringify(cards));
  check("totals: two currency cards, nothing added across them", cards.length === 2);
  check("list: all 5 payments, newest first", (await rows().count()) === 5 && /anna@example\.com/.test(await rows().first().innerText()));
  check("attention queue: 2 events and 1 flagged payment", (await attentionCount()) === 3 && /Needs attention\s*3/.test(await page.locator('[data-ui="attention"]').innerText()), await page.locator('[data-ui="attention"] h2').innerText());
  check("attention: the unmatched payment names what is wrong", /Paid, but no customer matched/.test(await page.locator('[data-ui="attention-event"]').first().innerText()));
  await audit("payments page");

  // filters and search
  await chip("Refunded").click(); await settle();
  check("filter Refunded shows only the refund", (await rows().count()) === 1 && /Refunded/.test(await rows().first().innerText()));
  await chip("Needs review").click(); await settle();
  check("filter Needs review shows only the flagged dispute", (await rows().count()) === 1 && /Disputed/.test(await rows().first().innerText()));
  await chip("Free codes").click(); await settle();
  check("filter Free codes shows the free-code checkout, labelled Free code and not Paid", (await rows().count()) === 1 && /FREE1/.test(await rows().first().innerText()) && !/\bPaid\b/.test(await rows().first().innerText()), await rows().first().innerText());
  await chip("Everything").click(); await settle();
  await page.fill("#payment-search", "anna@"); await settle();
  check("search by customer e-mail finds Anna's 3 payments", (await rows().count()) === 3, await rows().count());
  await page.fill("#payment-search", "cs_test_p2"); await settle();
  check("search by Checkout Session id finds that payment", (await rows().count()) === 1 && /nikos@example\.com/.test(await rows().first().innerText()));
  await page.fill("#payment-search", "nobody-here"); await settle();
  check("a search with no match says so", /No payment matches/.test(await page.locator('[data-ui="payments-list"]').innerText()));
  await page.fill("#payment-search", ""); await settle();

  // the drawer and re-sync
  await rows().first().click();
  await page.waitForSelector('[data-ui="payment-drawer"] [data-ui="stripe-link"]');
  const drawer = page.locator('[data-ui="payment-drawer"]');
  const dText = async () => (await drawer.innerText()).replace(/\s+/g, " ");
  check("drawer: amount, customer and the Stripe events that touched the payment", /\$99\.00/.test(await dText()) && /Anna/.test(await dText()) && /charge\.refunded/.test(await dText()), await dText());
  check("drawer: link into the Stripe dashboard (test mode)", (await drawer.locator('[data-ui="stripe-link"]').getAttribute("href")) === "https://dashboard.stripe.com/test/payments/pi_test_p1");
  await audit("payment drawer");
  const expiryBefore = (await db.collection("users").doc("cust1").get()).get("subscriptionExpiresAt") ?? null;
  await drawer.locator('[data-ui="resync-start"]').click();
  check("re-sync asks first and says it is safe to repeat", /safe to repeat/.test(await drawer.locator('[data-ui="resync-confirm"]').innerText()));
  await drawer.locator('[data-ui="resync-confirm-button"]').click();
  await page.waitForSelector('[data-ui="payment-result"]');
  check("re-sync of an already fulfilled payment changes nothing and says so", /already fulfilled, so nothing changed/.test(await drawer.locator('[data-ui="payment-result"]').innerText()));
  check("access time was not granted twice", ((await db.collection("users").doc("cust1").get()).get("subscriptionExpiresAt") ?? null) === expiryBefore);
  await page.waitForSelector('[data-ui="payment-activity"] li');
  check("the drawer's history shows who re-synced", /Re-synced with Stripe/.test(await drawer.locator('[data-ui="payment-activity"]').innerText()));
  await page.keyboard.press("Escape"); await settle();

  // resolve in place 1: credit an unmatched payment to a customer
  const unmatched = page.locator('[data-ui="attention-event"]').filter({ hasText: "Paid, but no customer matched" });
  await unmatched.locator('[data-ui="assign-start"]').click();
  await page.waitForSelector('[data-ui="assign-customer"]');
  await audit("credit a customer dialog");
  await page.fill("#assign-search", "anna");
  await page.waitForSelector('[data-ui="assign-results"] button');
  await page.locator('[data-ui="assign-results"] button').first().click();
  check("crediting asks for confirmation naming the customer", /Credit this payment to .*Anna/.test(await page.locator('[data-ui="assign-confirm"]').innerText()));
  await page.locator('[data-ui="assign-confirm-button"]').click();
  await page.waitForSelector('[data-ui="flash"]');
  check("flash message confirms who was credited and for how long", /Credited to anna@example\.com: 30 days/.test(await page.locator('[data-ui="flash"]').innerText()), await page.locator('[data-ui="flash"]').innerText());
  await settle();
  const nAtt = await attentionCount(), nRows = await rows().count();
  check("the item left the queue (3 → 2) and the payment is in the list", nAtt === 2 && nRows === 6, `queue=${nAtt} rows=${nRows} :: ${(await page.locator('[data-ui="attention"]').innerText().catch(() => "(no queue)")).replace(/\s+/g, " ").slice(0, 400)}`);
  const credited = (await db.collection("payments").doc("cs_test_lost").get()).data();
  check("stored: credited to Anna by an administrator, and her access was extended", credited?.uid === "cust1" && credited?.fulfilledBy === "admin" && ((await db.collection("users").doc("cust1").get()).get("subscriptionStatus")) === "active", JSON.stringify(credited));
  check("stored: the waiting Stripe event was closed", !!(await db.collection("stripe_events").doc("evt_un").get()).get("resolvedAt"));

  // resolve in place 2 and 3: mark reviewed with a note
  const partial = page.locator('[data-ui="attention-event"]').filter({ hasText: "Partial refund" });
  await partial.locator('[data-ui="review-start"]').click();
  await partial.locator("input").fill("agreed with the customer by e-mail");
  await partial.locator('[data-ui="review-confirm"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-ui="attention-event"]').length === 0);
  const flagged = page.locator('[data-ui="attention-payment"]');
  await flagged.locator('[data-ui="review-start"]').click();
  await flagged.locator("input").fill("chargeback answered in Stripe");
  await flagged.locator('[data-ui="review-confirm"]').click();
  await page.waitForSelector('[data-ui="attention-empty"]');
  check("everything resolved without leaving the page: the queue is empty", (await attentionCount()) === 0 && /Nothing needs attention/.test(await page.locator('[data-ui="attention-empty"]').innerText()));
  const trail = (await db.collection("audit_log").get()).docs.map((d) => d.data()).sort((a, b) => a.at - b.at);
  check("audit: every action is recorded under the administrator, with the notes",
    trail.map((a) => a.action).join(",") === "payment.resync,payment.resync,payment.review_event,payment.review" && trail.every((a) => a.actorUid === "photographer1") && /agreed with the customer/.test(trail[2].note) && /chargeback answered/.test(trail[3].note), JSON.stringify(trail.map((a) => [a.action, a.targetId, a.note])));

  // a phone
  await page.setViewportSize({ width: 390, height: 900 });
  await page.reload({ waitUntil: "load" }); await page.waitForSelector('[data-ui="payment-row"]'); await settle();
  check("390 px: no horizontal overflow", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  if (SHOT) await page.screenshot({ path: `${SHOT}/payments-390.png`, fullPage: true });
  await audit("payments page at 390");

  // a customer cannot reach it
  const other = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await other.newPage();
  await p2.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await login(p2, "unpaid@example.com");
  await p2.goto(`${BASE}/dashboard/admin/payments`, { waitUntil: "load" });
  await p2.waitForTimeout(1500);
  check("a customer is sent away from the admin Payments screen", !/\/admin\/payments/.test(p2.url()), p2.url());

  await browser.close(); stripe.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("SCRIPT ERROR", e); process.exit(1); });
