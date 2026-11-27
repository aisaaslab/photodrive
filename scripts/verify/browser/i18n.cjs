/**
 * S5-06 browser check: one language per page, rendered on the server in the visitor's language, remembered in a cookie.
 * Run against a production build served on :3997 (see README). Prints one PASS/FAIL line per check; exit code 1 on any FAIL.
 */
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3997";
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`); if (!ok) failed++; };

// Run with tsx (`NODE_PATH=$(npm root -g) npx tsx scripts/verify/browser/i18n.cjs`) so the real dictionaries can be required. A marker is the
// hero badge, which differs in every language; the title is the language's tab title.
const D = (l) => require(`../../../lib/i18n/dictionaries/${l}`)[l];
const { PAGE_TITLES } = require("../../../lib/i18n/languages");
const en = Object.fromEntries(["en", "el", "nl", "de", "es", "it"].map((l) => [l, { marker: D(l).hero.title1, title: PAGE_TITLES[l] }]));

(async () => {
  const browser = await chromium.launch();

  // 1. First visit with a German browser: server-rendered German, no English copy in the HTML, <html lang="de">.
  {
    const ctx = await browser.newContext({ locale: "de-DE", extraHTTPHeaders: { "Accept-Language": "de-DE,de;q=0.9,en;q=0.5" } });
    const raw = await ctx.request.get(`${BASE}/`);
    const html = await raw.text();
    check("first visit (de-DE): <html lang=de>", /<html[^>]*lang="de"/.test(html));
    check("first visit (de-DE): server HTML has German copy", html.includes(en.de.marker));
    check("first visit (de-DE): server HTML has no English copy", !html.includes(en.en.marker));
    check("first visit (de-DE): tab title is German", html.includes(`<title>${en.de.title}</title>`), (html.match(/<title>[^<]*/) || [""])[0]);

    const page = await ctx.newPage();
    const responses = [];
    page.on("response", (r) => { if (r.url().endsWith(".js")) responses.push(r.url()); });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    check("rendered page text is German", (await page.evaluate(() => document.body.innerText)).includes(en.de.marker));
    check("document.documentElement.lang is de", (await page.evaluate(() => document.documentElement.lang)) === "de");
    const bodies = [];
    for (const u of responses) bodies.push(await (await ctx.request.get(u)).text());
    const shippedEnglish = bodies.some((b) => b.includes(en.en.marker));
    const shippedGreek = bodies.some((b) => b.includes(en.el.marker));
    check("no English or Greek dictionary shipped to a German visitor", !shippedEnglish && !shippedGreek);
    check("no language cookie yet (nothing chosen)", !(await ctx.cookies()).some((c) => c.name === "lang"));

    // 2. Switch language in the page: only the new dictionary is fetched, the cookie is set, the page re-renders in it.
    const before = new Set(responses);
    const newChunks = [];
    page.on("response", (r) => { if (r.url().endsWith(".js") && !before.has(r.url())) newChunks.push(r.url()); });
    const toggle = page.locator("button:has-text('🇩🇪')").first();
    const hasToggle = await toggle.count();
    check("language switcher is present", hasToggle > 0);
    if (hasToggle) {
      // pick Greek through the visible menu if the switcher is a menu, else click until it lands on Greek
      await toggle.click();
      await page.getByRole("button", { name: /Ελληνικά/ }).first().click();
      await page.waitForFunction(() => document.documentElement.lang === "el", null, { timeout: 8000 }).catch(() => {});
      check("after choosing Greek: <html lang=el>", (await page.evaluate(() => document.documentElement.lang)) === "el");
      check("after choosing Greek: the page text is Greek", (await page.evaluate(() => document.body.innerText)).includes(en.el.marker));
      const cookie = (await ctx.cookies()).find((c) => c.name === "lang");
      check("after choosing Greek: lang cookie = el", cookie && cookie.value === "el", cookie && cookie.value);
      check("after choosing Greek: tab title is Greek", (await page.title()) === en.el.title, await page.title());
      let fetchedOnly = true;
      for (const u of newChunks) { const b = await (await ctx.request.get(u)).text(); if (b.includes(en.de.marker) || b.includes(en.en.marker)) fetchedOnly = false; }
      check("switching fetched at most the Greek dictionary", fetchedOnly, `${newChunks.length} new chunk(s)`);
      // 3. Reload: the server now renders Greek straight away.
      const again = await (await ctx.request.get(`${BASE}/`)).text();
      check("reload after choosing: server HTML is Greek", again.includes(en.el.marker) && !again.includes(en.de.marker) && /<html[^>]*lang="el"/.test(again));
    }
    await ctx.close();
  }

  // 4. No Accept-Language match → English; cookie beats the browser header.
  {
    const ctx = await browser.newContext({ extraHTTPHeaders: { "Accept-Language": "fr-FR,fr;q=0.9,ja;q=0.5" } });
    const html = await (await ctx.request.get(`${BASE}/`)).text();
    check("unsupported browser language → English", html.includes(en.en.marker) && /<html[^>]*lang="en"/.test(html));
    const withCookie = await (await ctx.request.get(`${BASE}/`, { headers: { Cookie: "lang=nl" } })).text();
    check("cookie wins over Accept-Language", withCookie.includes(en.nl.marker) && /<html[^>]*lang="nl"/.test(withCookie));
    const bad = await (await ctx.request.get(`${BASE}/`, { headers: { Cookie: "lang=xx", "Accept-Language": "it" } })).text();
    check("invalid cookie falls back to the browser's language", bad.includes(en.it.marker));
    await ctx.close();
  }

  // 5. Visitors from before the cookie existed (choice only in localStorage) are carried over once, with no loop.
  {
    const ctx = await browser.newContext({ extraHTTPHeaders: { "Accept-Language": "en" } });
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { if (!localStorage.getItem("lang")) localStorage.setItem("lang", "es"); } catch {} });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.waitForFunction((m) => document.documentElement.lang === "es", null, { timeout: 8000 }).catch(() => {});
    check("legacy localStorage choice (es) is adopted", (await page.evaluate(() => document.documentElement.lang)) === "es");
    check("…and stored as the cookie", (await ctx.cookies()).some((c) => c.name === "lang" && c.value === "es"));
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
})();
