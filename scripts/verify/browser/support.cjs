/**
 * The admin Support inbox (S8-02) in a real browser: counts and filters, search, opening a message (which marks it read), the account
 * matched to the sender's e-mail with its links, the reply link, an internal note, resolve / reopen / mark unread / delete, the audit
 * trail, 390 px, accessibility, and a customer being refused. Signs in through the real login form against the emulators.
 * Start the server with: ADMIN_UID=photographer1 scripts/verify/browser/serve-emu.sh
 * Usage: NODE_PATH=$(npm root -g) [AXE_PATH=<axe.min.js>] [SHOT=<dir>] node support.cjs (reset and reseed the emulators first).
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.env.BASE || "http://localhost:3997";
const SHOT = process.env.SHOT;
const axeSrc = process.env.AXE_PATH ? fs.readFileSync(process.env.AXE_PATH, "utf8") : null;
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const admin = require("./admin-compat.cjs");
const db = admin.firestore();
const HOUR = 3_600_000, DAY = 86_400_000, NOW = Date.now();
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " :: " + String(extra).slice(0, 300)}`); if (!ok) failed++; };

async function seed() {
  await admin.auth().createUser({ uid: "cust1", email: "anna@example.com", displayName: "Anna" }).catch(() => {});
  await db.collection("users").doc("cust1").set({ uid: "cust1", email: "anna@example.com", emailLower: "anna@example.com", name: "Anna", subscriptionStatus: "active", subscriptionExpiresAt: NOW + 40 * DAY, createdAt: NOW - 90 * DAY });
  const m = (id, o) => db.collection("contactMessages").doc(id).set({ emailed: true, ipHash: "h", userAgent: "ua", read: false, ...o });
  await m("m1", { name: "Anna P.", email: "anna@example.com", subject: "Invoice question", message: "Hello,\n\nI was charged twice for the yearly plan.\nCould you check?\n\nThanks, Anna", createdAt: NOW - HOUR });
  await m("m2", { name: "Visitor Vic", email: "vic@elsewhere.com", subject: "Partnership idea", message: "We would love to work with you on a bundle.", createdAt: NOW - 2 * HOUR });
  await m("m3", { name: "Nikos", email: "nikos@example.com", subject: "Password help", message: "How do I add a password to a gallery?", createdAt: NOW - DAY, read: true, note: "sent the help article" });
  await m("m4", { name: "Old Olga", email: "olga@example.com", subject: "Old thing", message: "This was dealt with long ago.", createdAt: NOW - 3 * DAY, read: true, status: "resolved", resolvedAt: NOW - 2 * DAY, resolvedBy: "photographer1" });
}

(async () => {
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
  const rows = () => page.locator('[data-ui="message-row"]');
  const settle = () => page.waitForTimeout(700);
  const chip = (name) => page.getByRole("group", { name: "Show" }).getByRole("button", { name: new RegExp(`^${name}`) });
  const drawer = page.locator('[data-ui="message-drawer"]');
  const msg = async (id) => (await db.collection("contactMessages").doc(id).get()).data();
  const trail = async () => (await db.collection("audit_log").get()).docs.map((d) => d.data()).sort((a, b) => a.at - b.at);
  const openRow = async (text) => { await rows().filter({ hasText: text }).first().click(); await drawer.waitFor(); };
  const closeDrawer = async () => { await page.keyboard.press("Escape"); await settle(); };

  await login(page, "photographer@example.com"); // the administrator (ADMIN_UID=photographer1)
  await page.goto(`${BASE}/dashboard/admin/support`, { waitUntil: "load" });
  await page.waitForSelector('[data-ui="message-row"]'); await settle();
  if (SHOT) await page.screenshot({ path: `${SHOT}/support.png`, fullPage: true });

  check("summary says 2 unread · 3 open", /2 unread · 3 open/.test(await page.locator('[data-ui="support-summary"]').innerText()), await page.locator('[data-ui="support-summary"]').innerText());
  const chips = (await page.getByRole("group", { name: "Show" }).innerText()).replace(/\s+/g, " ");
  check("chips carry the counts: Open 3, Unread 2, Resolved 1, Everything 4", /Open 3/.test(chips) && /Unread 2/.test(chips) && /Resolved 1/.test(chips) && /Everything 4/.test(chips), chips);
  check("the default view is what still needs an answer: 3 open, newest first, 2 of them unread", (await rows().count()) === 3 && /Anna P\./.test(await rows().first().innerText()) && (await page.locator('[data-ui="message-row"][data-state="unread"]').count()) === 2);
  check("the sender who is a customer is marked as one", (await page.locator('[data-ui="customer-badge"]').count()) === 1 && /Anna/.test(await rows().filter({ has: page.locator('[data-ui="customer-badge"]') }).first().innerText()));
  await audit("support list");

  await chip("Unread").click(); await settle();
  check("Unread shows the 2 nobody has opened", (await rows().count()) === 2);
  await chip("Resolved").click(); await settle();
  check("Resolved shows the 1 dealt with", (await rows().count()) === 1 && /Old Olga/.test(await rows().first().innerText()));
  await chip("Everything").click(); await settle();
  check("Everything shows all 4", (await rows().count()) === 4);
  await chip("Open").click(); await settle();
  await page.fill("#support-search", "charged twice"); await settle();
  check("search finds a message by its text", (await rows().count()) === 1 && /Invoice question/.test(await rows().first().innerText()));
  await page.fill("#support-search", "help article"); await settle();
  check("search also looks in the internal notes", (await rows().count()) === 1 && /Nikos/.test(await rows().first().innerText()));
  await page.fill("#support-search", "nothing-like-this"); await settle();
  check("a search with no match says so", /No message matches/.test(await page.locator('[data-ui="messages-list"]').innerText()));
  await page.fill("#support-search", ""); await settle();

  // open a customer's message: marked read, account matched, reply link
  await openRow("Invoice question");
  await page.waitForFunction(() => document.querySelector('[data-ui="message-drawer"] [data-ui="message-state"]')?.getAttribute("data-state") === "read");
  check("opening an unread message marks it read (stored, and audited)", (await msg("m1")).read === true && (await trail()).some((a) => a.action === "message.mark_read" && a.targetId === "m1"));
  const body = await drawer.locator('[data-ui="message-body"]').innerText();
  check("the full message is shown with its line breaks", /Hello,\n\nI was charged twice for the yearly plan\.\nCould you check\?/.test(body), JSON.stringify(body));
  const acct = (await drawer.locator('[data-ui="message-account"]').innerText()).replace(/\s+/g, " ");
  check("the sender's account is matched: name, Customer, plan active until a date", /Anna/.test(acct) && /Customer/.test(acct) && /Plan active until/.test(acct), acct);
  check("one click to the account and to their payments", (await drawer.locator('[data-ui="open-account"]').getAttribute("href")) === "/dashboard/admin/users?q=anna%40example.com" && (await drawer.locator('[data-ui="open-payments"]').getAttribute("href")) === "/dashboard/admin/payments?q=anna%40example.com");
  check("reply link opens a mail to the sender with Re: and the subject", (await drawer.locator('[data-ui="reply-link"]').getAttribute("href")) === "mailto:anna@example.com?subject=Re%3A%20Invoice%20question");
  await audit("message drawer");

  // note + resolve
  await drawer.locator("#message-note").fill("Checked Stripe: one charge only, explained to her");
  await drawer.locator('[data-ui="save-note"]').click();
  await drawer.locator('[data-ui="message-result"]').filter({ hasText: "Note saved" }).waitFor();
  check("the internal note is stored with who wrote it", (await msg("m1")).note === "Checked Stripe: one charge only, explained to her" && (await msg("m1")).noteBy === "photographer1");
  await drawer.locator('[data-ui="resolve"]').click();
  await page.waitForFunction(() => document.querySelector('[data-ui="message-drawer"] [data-ui="message-state"]')?.getAttribute("data-state") === "resolved");
  const m1 = await msg("m1");
  check("resolved: status, who and when are stored", m1.status === "resolved" && m1.resolvedBy === "photographer1" && typeof m1.resolvedAt === "number");
  const t1 = await trail();
  check("the audit trail has the resolve entry under the administrator (and no message text or e-mail)", t1.some((a) => a.action === "message.resolve" && a.targetId === "m1" && a.actorUid === "photographer1") && !JSON.stringify(t1).includes("charged twice") && !JSON.stringify(t1).includes("anna@example.com"), JSON.stringify(t1.map((a) => a.action)));
  await closeDrawer();
  check("after closing, the list and the counts have moved on (1 unread · 2 open)", /1 unread · 2 open/.test(await page.locator('[data-ui="support-summary"]').innerText()) && (await rows().count()) === 2, await page.locator('[data-ui="support-summary"]').innerText());

  // someone who is not a customer
  await openRow("Partnership idea");
  check("a sender with no account is told so", /No account uses this e-mail address/.test(await drawer.locator('[data-ui="message-account"]').innerText()) && (await drawer.locator('[data-ui="open-account"]').count()) === 0);
  await closeDrawer();

  // mark unread, reopen
  await openRow("Password help");
  await drawer.locator('[data-ui="mark-unread"]').click();
  await page.waitForFunction(() => document.querySelector('[data-ui="message-drawer"] [data-ui="message-state"]')?.getAttribute("data-state") === "unread");
  check("mark unread is stored", (await msg("m3")).read === false);
  await closeDrawer();
  await chip("Resolved").click(); await settle();
  await openRow("Old thing");
  await drawer.locator('[data-ui="reopen"]').click();
  await page.waitForFunction(() => document.querySelector('[data-ui="message-drawer"] [data-ui="message-state"]')?.getAttribute("data-state") === "read");
  check("reopening a resolved message keeps it read and clears who resolved it", (await msg("m4")).status === "open" && (await msg("m4")).read === true && (await msg("m4")).resolvedBy === undefined);
  await closeDrawer();

  // delete with confirmation
  await chip("Everything").click(); await settle();
  await openRow("Partnership idea");
  await drawer.locator('[data-ui="delete-start"]').click();
  check("deleting asks first", /Delete this message for good/.test(await drawer.locator('[data-ui="delete-confirm"]').innerText()));
  await drawer.locator('[data-ui="delete-confirm-button"]').click();
  await drawer.waitFor({ state: "detached" }); await settle();
  check("deleted: gone from the list and the database, audited without the sender's data", (await rows().filter({ hasText: "Partnership idea" }).count()) === 0 && !(await db.collection("contactMessages").doc("m2").get()).exists && (await trail()).some((a) => a.action === "message.delete" && a.targetId === "m2") && !JSON.stringify(await trail()).includes("vic@elsewhere.com"));

  // the links lead somewhere useful
  await openRow("Invoice question");
  await drawer.locator('[data-ui="open-account"]').click();
  await page.waitForURL(/\/dashboard\/admin\/users\?q=anna/);
  await page.waitForSelector('[data-ui="user-row"]');
  check("“Open the account” lands on the Users screen showing Anna", (await page.locator('[data-ui="user-row"]').count()) === 1 && /anna@example\.com/.test(await page.locator('[data-ui="user-row"]').first().innerText()));
  await page.goBack(); await page.waitForSelector('[data-ui="message-row"]');

  // a phone
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${BASE}/dashboard/admin/support`, { waitUntil: "load" }); await page.waitForSelector('[data-ui="message-row"]'); await settle();
  check("390 px: no horizontal overflow", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  const tab = await page.locator('[aria-label="Back office sections"] [aria-current="page"]').boundingBox();
  check("390 px: the current tab (Support) has been scrolled into view", !!tab && tab.x >= 0 && tab.x + tab.width <= 390, JSON.stringify(tab));
  if (SHOT) await page.screenshot({ path: `${SHOT}/support-390.png`, fullPage: true });
  await audit("support list at 390");
  await rows().first().click(); await drawer.waitFor(); await settle();
  check("390 px drawer: no horizontal overflow", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);

  const other = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await other.newPage();
  await p2.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await login(p2, "unpaid@example.com");
  await p2.goto(`${BASE}/dashboard/admin/support`, { waitUntil: "load" });
  await p2.waitForTimeout(1500);
  check("a customer is sent away from the admin Support screen", !/\/admin\/support/.test(p2.url()), p2.url());

  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("SCRIPT ERROR", e); process.exit(1); });
