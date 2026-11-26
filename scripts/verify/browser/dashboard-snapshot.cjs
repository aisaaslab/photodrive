// Behaviour snapshot of the photographer's dashboard in a real browser, signed in through the app's own login form against the Firebase
// emulators (S5-07 / S5-09 / S5-10: split big components with no behaviour change; and a regression net for the coming redesign: it
// records what the screens DO, not how they look). Prints JSON; run before and after a refactor and `diff`. Reset the emulators and
// reseed (seed.cjs) before each run: the steps create, edit and delete galleries.
//   node dashboard-snapshot.cjs > snapshot.json
const { chromium } = require("playwright");
const fs = require("node:fs");
const BASE = "http://localhost:3997";

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").replace(/\d{1,2} [A-Z][a-z]{2} \d{4}/g, "DATE").replace(/\b\d{1,2}:\d{2}\b/g, "TIME").replace(/\d+ days? remaining/g, "N days remaining").trim();

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  const out = {};
  const requests = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/galleries") && ["POST", "PATCH", "DELETE", "PUT"].includes(r.method())) {
      let body = null;
      try { body = JSON.parse(r.postData() || "null"); } catch { body = r.postData(); }
      requests.push({ method: r.method(), path: new URL(r.url()).pathname.replace(/\/[A-Za-z0-9]{20}(?=\/|$)/g, "/ID"), body });
    }
  });
  const step = (name, value) => { out[name] = value; console.error("ok:", name); };
  const takeRequests = () => requests.splice(0, requests.length);

  // ---- helpers
  const cardsInfo = () => page.evaluate(() => [...document.querySelectorAll("h3")].filter((h) => h.closest("div")?.parentElement?.querySelector('button[aria-label="More"]')).map((h) => {
    const root = h.closest("div.rounded-card, div.rounded-2xl, div.group, div") && h.parentElement.parentElement.parentElement;
    const cardRoot = h.closest("[class*='rounded-card'], [class*='rounded-2xl']") ?? root;
    return {
      title: h.textContent.trim(),
      badge: [...cardRoot.querySelectorAll("span")].map((s) => s.textContent.trim()).find((t) => /^(Public|Password|Private)$/.test(t)) ?? null,
      text: cardRoot.innerText.replace(/\s+/g, " ").replace(/\d{1,2} [A-Z][a-z]{2} \d{4}/g, "DATE").trim().slice(0, 120),
    };
  }));
  const titles = async () => (await cardsInfo()).map((c) => c.title);
  const card = (title) => page.locator(`h3:has-text("${title}")`).locator("xpath=ancestor::*[.//button[@aria-label='More']][1]");
  const toastText = async () => clean(await page.evaluate(() => [...document.querySelectorAll('[role="status"],[role="alert"],[aria-live]')].map((e) => e.textContent).filter(Boolean).join(" | ")));
  // Toasts fade by themselves; wait until none is showing before an action, so each step records only its own.
  const clearToasts = () => page.waitForFunction(() => ![...document.querySelectorAll('[role="status"][aria-live]')].some((e) => e.textContent.trim()), null, { timeout: 10000 }).catch(() => {});
  const dialog = () => page.locator('[role="dialog"]').last();
  const headerFacts = () => page.evaluate(() => ({
    h1: document.querySelector("h1")?.textContent.trim(),
    lines: [...document.querySelectorAll("h1 ~ p, h1 + div p, header ~ div p")].map((p) => p.textContent.replace(/\s+/g, " ").replace(/\d{1,2} [A-Z][a-z]{2} \d{4}/g, "DATE").replace(/\d+ days? remaining/g, "N days remaining").trim()).slice(0, 4),
  }));

  // ---- sign in through the real login form
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.fill("input[type=email]", "photographer@example.com");
  await page.fill("input[type=password]", "test-password-1");
  await page.locator("label:has(input[type=checkbox])").first().click({ position: { x: 8, y: 8 } });
  await page.click("button:has-text('Sign in'):not(:has-text('Google'))");
  await page.waitForURL(/dashboard/);
  await page.waitForSelector('button[aria-label="More"]');
  await page.waitForTimeout(800);

  step("01 dashboard", { header: await headerFacts(), cards: await cardsInfo() });

  // ---- search and sort
  await page.fill('input[placeholder^="Search"]', "priv");
  step("02 search priv", await titles());
  await page.fill('input[placeholder^="Search"]', "zzz-nothing");
  step("03 search nothing", { titles: await titles(), page: clean(await page.innerText("body")).slice(0, 400) });
  await page.fill('input[placeholder^="Search"]', "");
  for (const option of ["Oldest first", "Name A→Z", "Name Z→A", "Newest first"]) {
    await page.selectOption("select", { label: option });
    step(`04 sort ${option}`, await titles());
  }
  await page.selectOption("select", { label: "Name A→Z" });

  // ---- copy link, open link
  await card("Public test").getByText("Copy link").click();
  await page.waitForTimeout(300);
  step("05 copy link", { button: clean(await card("Public test").innerText()).slice(-60), clipboard: (await page.evaluate(() => navigator.clipboard.readText())).replace(/^https?:\/\/[^/]+/, "BASE"), toast: await toastText() });
  step("06 open link", await card("Public test").locator('a:has-text("Open")').evaluate((a) => ({ href: a.getAttribute("href"), target: a.getAttribute("target") })));

  // ---- the client's favourites (selections) panel
  const before = clean(await card("Public test").innerText());
  await card("Public test").getByText("Favorites").first().click();
  await page.waitForTimeout(700);
  step("07 favourites panel", { newBadgeBefore: /\bnew\b/i.test(before), text: clean(await dialog().innerText()), buttons: await dialog().locator("button").evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") || e.textContent).trim().replace(/\s+/g, " ")).filter(Boolean)) });
  const copyList = dialog().locator("button:has-text('Copy')").first();
  if (await copyList.count()) { await copyList.click(); await page.waitForTimeout(250); step("08 copy selection list", await page.evaluate(() => navigator.clipboard.readText())); }
  const zipBtn = dialog().locator("button:has-text('.zip'), button:has-text('Download')").first();
  if (await zipBtn.count()) {
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), zipBtn.click()]);
    const file = "/tmp/claude-dash-selection.zip";
    await download.saveAs(file);
    const buf = fs.readFileSync(file);
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = eocd < 0 ? -1 : buf.readUInt16LE(eocd + 10);
    let p = eocd < 0 ? 0 : buf.readUInt32LE(eocd + 16); const names = [];
    for (let i = 0; i < count; i++) { const n = buf.readUInt16LE(p + 28), e = buf.readUInt16LE(p + 30), c = buf.readUInt16LE(p + 32); names.push(buf.subarray(p + 46, p + 46 + n).toString()); p += 46 + n + e + c; }
    fs.unlinkSync(file);
    step("09 selection zip", { filename: download.suggestedFilename(), entries: names.sort() });
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  step("10 after closing, the New badge is gone", /\bnew\b/i.test(clean(await card("Public test").innerText())));

  // ===== STAGE2 =====
  const openMenu = async (title) => { await clearToasts(); await card(title).locator('button[aria-label="More"]').click(); };
  const openEdit = async (title) => { await openMenu(title); await page.locator("[role=menu] >> text=Edit").click(); await page.waitForSelector('[role="dialog"]'); await page.waitForTimeout(300); };
  const dialogText = async () => clean(await dialog().innerText());
  const fieldValues = () => dialog().evaluate((d) => ({
    inputs: [...d.querySelectorAll("input:not([type=color]),textarea")].map((e) => `${e.type}|${e.getAttribute("aria-label") || e.labels?.[0]?.textContent?.trim().slice(0, 30) || e.placeholder}=${e.type === "checkbox" ? e.checked : e.value}`),
    switches: [...d.querySelectorAll('[role="switch"],[role="radio"]')].map((e) => `${e.getAttribute("role")}:${(e.textContent || "").trim().slice(0, 12)}:${e.getAttribute("aria-checked")}`),
  }));
  const save = async () => { await clearToasts(); await dialog().locator("button:has-text('Save')").click(); await page.waitForTimeout(900); };
  const afterSave = async () => ({ requests: takeRequests(), toast: await toastText(), dialogOpen: (await page.locator('[role="dialog"]').count()) > 0 });

  // ---- edit: initial values of a private and of a public gallery
  await openEdit("Private test");
  step("11 edit private: initial", { text: await dialogText(), fields: await fieldValues() });
  // password change
  await dialog().getByLabel(/password/i).first().fill("new-secret-9");
  await save();
  step("12 edit private: new password saved", await afterSave());
  // the card's password reminder: reveal and hide
  const pwBtn = card("Private test").locator("h3 + button");
  await pwBtn.click();
  step("12b card: password revealed", clean(await card("Private test").innerText()).slice(0, 140));
  await pwBtn.click();
  step("12c card: password hidden again", clean(await card("Private test").innerText()).slice(0, 140));
  // switching a private gallery to public needs a confirmation
  await openEdit("Private test");
  await dialog().locator('[role="radio"]:has-text("Public")').click();
  step("13 edit private: choose Public shows the warning", await dialogText());
  await save();
  step("14 edit private: Save without confirming is refused", { ...(await afterSave()), text: await dialogText().catch(() => "") });
  await dialog().locator("button:has-text('Cancel')").last().click();
  await page.waitForTimeout(400);
  step("15 edit private: Cancel leaves it private", { dialogOpen: (await page.locator('[role="dialog"]').count()) > 0, card: clean(await card("Private test").innerText()).slice(0, 60) });

  // public -> private needs a password
  await openEdit("Public test");
  await dialog().locator('[role="radio"]:has-text("Private")').click();
  await save();
  step("16 edit public: Private without a password is refused", { ...(await afterSave()), text: await dialogText().catch(() => "") });
  await dialog().locator("button:has-text('Cancel')").last().click();
  await page.waitForTimeout(400);

  // a full edit of the public gallery: details, appearance, downloads, links
  await openEdit("Public test");
  await dialog().getByLabel("Name", { exact: true }).fill("Public test (edited)");
  await dialog().getByLabel("Description").fill("A description");
  await dialog().getByLabel("Event date").fill("2026-06-15");
  await dialog().getByLabel("Location").fill("Santorini, Greece");
  await dialog().locator("button:has-text('Elegant')").click();
  await dialog().locator('button[aria-label="#f2c4c4"]').click();
  await dialog().locator("button:has-text('Large')").click();
  await dialog().locator('[role="switch"][aria-labelledby^="brand-"]').click();
  await dialog().getByLabel(/Allow photo downloads/).uncheck({ force: true });
  await dialog().locator('input[aria-label="instagram"]').fill("instagram.com/photographer");
  step("17 edit public: fields before saving", await fieldValues());
  await save();
  step("18 edit public: saved (the request, the toast, the card)", { ...(await afterSave()), titles: await titles() });
  await openEdit("Public test (edited)");
  step("19 edit public: reopened shows what was saved", await fieldValues());
  await dialog().locator("button:has-text('Cancel')").last().click();
  await page.waitForTimeout(300);

  // make a public gallery private with a password
  await openEdit("Big gallery");
  await dialog().locator('[role="radio"]:has-text("Private")').click();
  await dialog().getByLabel(/password/i).first().fill("big-secret-1");
  await save();
  step("20 edit public: made private with a password", { ...(await afterSave()), card: clean(await card("Big gallery").innerText()).slice(0, 60) });

  // finally confirm switching the private gallery to public
  await openEdit("Private test");
  await dialog().locator('[role="radio"]:has-text("Public")').click();
  await dialog().getByLabel(/remove the password and make it public/i).check();
  step("21 edit private: confirmation controls", await dialogText());
  await save();
  step("22 edit private: switched to public", { ...(await afterSave()), card: clean(await card("Private test").innerText()).slice(0, 60) });

  // ---- cover picker
  await openMenu("No downloads");
  await page.locator("[role=menu] >> text=Choose cover").click();
  await page.waitForTimeout(1200);
  step("23 cover picker", { text: await dialogText(), tiles: await dialog().locator("div[title]:has(img)").count() });
  await dialog().locator("div[title]:has(img)").nth(1).click();
  await page.waitForTimeout(400);
  step("24 cover picker: picked the second photo", await dialogText());
  await dialog().locator('[aria-label*="position" i], [role="group"]').first().focus().catch(() => {});
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  step("25 cover picker: moved the focal point", await dialog().locator("button:has-text('Center'), button:has-text('Reset')").allTextContents());
  await clearToasts();
  await dialog().locator("button:has-text('Save')").click();
  await page.waitForTimeout(900);
  step("26 cover saved", await afterSave());
  await openMenu("No downloads");
  await page.locator("[role=menu] >> text=Choose cover").click();
  await page.waitForTimeout(1000);
  await dialog().locator("text=Remove cover").click();
  await page.waitForTimeout(300);
  step("27 cover picker: remove cover", await dialogText());
  await clearToasts();
  await dialog().locator("button:has-text('Save')").click();
  await page.waitForTimeout(900);
  step("28 cover removed", await afterSave());

  // ---- delete
  await openMenu("No downloads");
  await page.locator("[role=menu] >> text=Delete").click();
  await page.waitForTimeout(300);
  step("29 delete confirmation", await dialogText());
  await dialog().locator("button:has-text('Cancel')").click();
  await page.waitForTimeout(300);
  step("30 delete cancelled", { titles: await titles(), requests: takeRequests() });
  await openMenu("No downloads");
  await page.locator("[role=menu] >> text=Delete").click();
  await clearToasts();
  await dialog().locator("button:has-text('Delete')").click();
  await page.waitForTimeout(900);
  step("31 deleted", { titles: await titles(), header: await headerFacts(), requests: takeRequests(), toast: await toastText() });

  // ---- new gallery
  await clearToasts();
  await page.click("button:has-text('New Gallery')");
  await page.waitForTimeout(400);
  const formFacts = () => page.evaluate(() => {
    const f = document.querySelector("form");
    return f ? { fields: [...f.querySelectorAll("input,textarea")].map((e) => `${e.type}:${e.placeholder || e.name}`), radios: [...f.querySelectorAll('[role="radio"]')].map((e) => `${e.textContent.trim().slice(0, 10)}:${e.getAttribute("aria-checked")}`) } : null;
  });
  const validity = () => page.evaluate(() => [...document.querySelectorAll("form input, form textarea")].filter((e) => !e.validity.valid).map((e) => `${e.placeholder || e.name}: ${e.validationMessage ? "invalid" : ""}`));
  step("32 new gallery: form", await formFacts());
  await page.click("button:has-text('Create Gallery')");
  await page.waitForTimeout(300);
  step("33 new gallery: empty submit is blocked", { invalid: await validity(), requests: takeRequests() });
  await page.fill('input[placeholder^="e.g. Anna"]', "My New Gallery");
  await page.fill('input[placeholder^="https://drive"]', "not a url");
  await page.click("button:has-text('Create Gallery')");
  await page.waitForTimeout(300);
  step("34 new gallery: a bad link is blocked", { invalid: await validity(), requests: takeRequests() });
  await page.fill('input[placeholder^="https://drive"]', "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
  await page.locator('[role="radio"]:has-text("Private")').click();
  await page.click("button:has-text('Create Gallery')");
  await page.waitForTimeout(300);
  step("35 new gallery: private without a password is blocked", { invalid: await validity(), form: await formFacts(), requests: takeRequests() });
  await page.locator('[role="radio"]:has-text("Public")').click();
  await clearToasts();
  await page.fill('textarea[placeholder^="A few words"]', "About this");
  await page.fill('input[placeholder="City, Country"]', "Athens");
  await page.click("button:has-text('Create Gallery')");
  await page.waitForTimeout(1500);
  step("36 new gallery: public created", { requests: takeRequests(), titles: await titles(), header: await headerFacts(), toast: await toastText() });
  await clearToasts();
  await page.click("button:has-text('New Gallery')");
  await page.waitForTimeout(300);
  await page.fill('input[placeholder^="e.g. Anna"]', "My Private Gallery");
  await page.fill('input[placeholder^="https://drive"]', "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
  await page.locator('[role="radio"]:has-text("Private")').click();
  await page.fill('input[placeholder="Gallery password"]', "my-secret-12");
  await page.click("button:has-text('Create Gallery')");
  await page.waitForTimeout(1500);
  step("37 new gallery: private created", { requests: takeRequests(), titles: await titles(), header: await headerFacts() });

  // ---- sign out
  await page.click("text=Sign out");
  await page.waitForTimeout(1000);
  step("38 signed out", { url: new URL(page.url()).pathname });


  // ===== STAGE3: a photographer with no subscription =====
  await ctx.clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); indexedDB.databases?.().then((dbs) => dbs.forEach((d) => indexedDB.deleteDatabase(d.name))); });
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.fill("input[type=email]", "unpaid@example.com");
  await page.fill("input[type=password]", "test-password-1");
  await page.locator("label:has(input[type=checkbox])").first().click({ position: { x: 8, y: 8 } });
  await page.click("button:has-text('Sign in'):not(:has-text('Google'))");
  await page.waitForURL(/dashboard/);
  await page.waitForTimeout(1500);
  step("39 unpaid photographer: dashboard", { header: await headerFacts(), titles: await titles(), text: clean(await page.innerText("body")).slice(0, 260) });
  await page.click("button:has-text('New Gallery')");
  await page.waitForTimeout(400);
  await page.fill('input[placeholder^="e.g. Anna"]', "Wedding Day");
  await page.fill('input[placeholder^="https://drive"]', "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
  await page.fill('textarea[placeholder^="A few words"]', "A lovely day");
  await page.fill('input[placeholder="City, Country"]', "Rhodes");
  await page.locator('[role="radio"]:has-text("Private")').click();
  await page.fill('input[placeholder="Gallery password"]', "paywall-pass-1");
  await page.locator("button:has-text('Instagram')").click();
  await page.fill('input[placeholder^="https://instagram"]', "https://instagram.com/wedding");
  await page.click("button:has-text('Create Gallery')");
  await page.waitForSelector("text=/Subscri|Buy|plan/i", { timeout: 20000 });
  await page.waitForTimeout(1200);
  step("40 unpaid: the payment step replaces the form", { requests: takeRequests(), text: clean(await page.innerText("body")).slice(0, 500), buttons: await page.$$eval("button", (els) => els.map((e) => e.textContent.trim().replace(/\s+/g, " ").slice(0, 40)).filter(Boolean)) });
  step("41 unpaid: the plan list", await page.evaluate(() => [...document.querySelectorAll("button[aria-pressed]")].map((b) => ({ text: b.textContent.replace(/\s+/g, " ").trim(), pressed: b.getAttribute("aria-pressed") }))));
  await page.locator("text=/back to|Back/i").first().click();
  await page.waitForTimeout(400);
  step("42 unpaid: back to the form keeps what was typed", await page.evaluate(() => [...document.querySelectorAll("form input, form textarea")].map((e) => `${e.type}:${e.placeholder}=${e.type === "password" ? "***" + e.value.length : e.value}`)));
  await page.click("button:has-text('Create Gallery')");
  await page.waitForTimeout(2500);
  await page.locator("button:has-text('Buy'), button:has-text('Subscribe'), button:has-text('Get')").first().click();
  await page.waitForTimeout(1500);
  step("43 unpaid: checkout is attempted (payments are not configured here) and the form is kept for after payment", {
    text: clean(await page.innerText("body")).slice(0, 300),
    pending: await page.evaluate(() => JSON.parse(localStorage.getItem("pending_gallery") || "null")),
  });
  // after payment the dashboard restores the form and creates the gallery by itself; here the subscription never becomes active
  await page.goto(`${BASE}/dashboard?gallery=pending`, { waitUntil: "load" });
  await page.waitForTimeout(1800);
  step("44 unpaid: the restored form after payment", await page.evaluate(() => [...document.querySelectorAll("form input, form textarea")].map((e) => `${e.type}:${e.placeholder}=${e.type === "password" ? "***" + e.value.length : e.value}`)));
  await page.waitForSelector("text=/Subscri|Buy|plan/i", { timeout: 30000 });
  step("45 unpaid: still not active, so the payment step is shown again", { requests: takeRequests().map((r) => r.method + " " + r.path), pending: await page.evaluate(() => localStorage.getItem("pending_gallery") !== null) });

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error("SNAPSHOT FAILED:", e.message.split("\n").slice(0, 4).join(" | ")); process.exit(1); });
