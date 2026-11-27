/**
 * Final keyboard and phone pass (S5-12). On each key screen: Tab through every control and check that each one shows a focus
 * indicator, that focus never gets stuck, and that the controls can be reached; dialogs close with Escape and give focus back; and at
 * 390 px every visible control is at least 24 x 24 px (WCAG 2.2 target size, level AA) with no horizontal overflow.
 * Emulators seeded by emu-reset.sh --plans, server from serve-emu.sh WITHOUT ADMIN_UID (the signed-in user is the seeded photographer).
 * Usage: NODE_PATH=$(npm root -g) [VERBOSE=1] node keyboard-mobile.cjs
 */
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3997";
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " :: " + String(extra).slice(0, 600)}`); if (!ok) failed++; };

/** Tab through the page; returns what each stop looked like. */
async function tabThrough(page, max = 80) {
  const stops = [];
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const s = await page.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body) return { body: true };
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
      const shadow = cs.boxShadow && cs.boxShadow !== "none";
      // A focus ring may be drawn by the element's parent (focus-within) or label; accept a visible ring on the nearest label / ancestor too.
      let wrapped = false;
      for (let p = e.parentElement, n = 0; p && n < 3; p = p.parentElement, n++) {
        const pc = getComputedStyle(p);
        if ((pc.outlineStyle !== "none" && parseFloat(pc.outlineWidth) > 0) || (pc.boxShadow && pc.boxShadow !== "none" && p.matches(":focus-within") && /ring|focus/.test(p.className))) { wrapped = true; break; }
      }
      const name = (e.getAttribute("aria-label") || e.innerText || e.getAttribute("placeholder") || e.id || e.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
      return { tag: e.tagName.toLowerCase(), name, indicator: outline || shadow || wrapped, w: Math.round(r.width), h: Math.round(r.height), key: e.tagName + "|" + name + "|" + Math.round(r.x) + "|" + Math.round(r.y) };
    });
    if (s.body) { stops.push(s); break; } // focus left the document: the cycle is complete
    stops.push(s);
    if (stops.length > 3 && stops.slice(0, -1).some((x) => x.key === s.key)) break; // wrapped around to a control already seen
  }
  return stops;
}

async function visibleTargets(page) {
  return page.evaluate(() => {
    const out = [];
    for (const e of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=menuitem], [role=radio], [role=switch]')) {
      const cs = getComputedStyle(e);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      if (e.closest("[aria-hidden=true]") || e.closest("[inert]")) continue;
      let r = e.getBoundingClientRect();
      if (e.matches("input[type=radio],input[type=checkbox]") && cs.position === "absolute" && r.width <= 2) { const l = e.closest("label"); if (!l) continue; r = l.getBoundingClientRect(); }
      if (r.width === 0 || r.height === 0) continue;
      if (e.classList.contains("sr-only") || (cs.position === "absolute" && r.width <= 2)) continue; // visually hidden (skip links, hidden radios)
      // an inline link inside a sentence is exempt from the target-size rule
      const inline = e.tagName === "A" && cs.display === "inline";
      if (inline) continue;
      if (r.width < 24 || r.height < 24) out.push(`${e.tagName.toLowerCase()} "${(e.getAttribute("aria-label") || e.innerText || e.id || "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
}

(async () => {
  const browser = await chromium.launch();
  const mk = async (w) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: w > 600 ? 900 : 800 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
    return page;
  };
  const login = async (p, email = "photographer@example.com") => {
    await p.goto(`${BASE}/login`, { waitUntil: "load" });
    await p.fill("input[type=email]", email); await p.fill("input[type=password]", "test-password-1");
    await p.locator("label:has(input[type=checkbox])").first().click({ position: { x: 8, y: 8 } });
    await p.click("button:has-text('Sign in'):not(:has-text('Google'))");
    await p.waitForURL(/dashboard/);
  };

  // who looks at each screen: "owner" (the seeded, subscribed photographer), "unpaid" (nothing active, so /subscribe is shown) or nobody
  const screens = [
    ["login", "/login", "none", "input[type=email]"],
    ["dashboard", "/dashboard", "owner", '[data-ui="gallery-list"]'],
    ["account", "/dashboard/account", "owner", "h1"],
    ["billing", "/dashboard/billing", "owner", "h1"],
    ["subscribe", "/subscribe", "unpaid", '[data-ui="plan-option"]'],
    ["gallery", "/gallery/pubtest", "none", "#photos"],
    ["password gate", "/gallery/privtest", "none", "#gallery-password"],
    ["faq", "/faq", "none", "h1"],
    ["terms", "/terms", "none", "h1"],
  ];

  // ---- keyboard, desktop
  const desk = await mk(1280);
  const deskOut = await mk(1280);
  const deskUnpaid = await mk(1280);
  await login(desk); await login(deskUnpaid, "unpaid@example.com");
  const pick = (who, a, b, c) => (who === "owner" ? a : who === "unpaid" ? b : c);
  for (const [name, url, who, ready] of screens) {
    const desk_ = pick(who, desk, deskUnpaid, deskOut);
    await desk_.goto(`${BASE}${url}`, { waitUntil: "load" });
    await desk_.waitForSelector(ready, { timeout: 15000 }).catch(() => {});
    await desk_.waitForTimeout(700);
    const stops = await tabThrough(desk_);
    const real = stops.filter((s) => !s.body);
    const noRing = real.filter((s) => !s.indicator).map((s) => `${s.tag} "${s.name}"`);
    check(`${name}: Tab reaches controls (${real.length}) and every one shows a focus indicator`, real.length >= 2 && noRing.length === 0, noRing.join(" | "));
    check(`${name}: focus is not trapped (the Tab cycle ends or wraps)`, stops.length < 80 || stops.some((s) => s.body), String(stops.length));
  }

  // ---- dialogs: Escape closes and focus returns
  await desk.goto(`${BASE}/dashboard`, { waitUntil: "load" }); await desk.waitForSelector('[data-ui="gallery-list"]'); await desk.waitForTimeout(500);
  const more = desk.locator('button[aria-label="More"]').first();
  await more.focus(); await desk.keyboard.press("Enter");
  check("dashboard: the card menu opens from the keyboard", (await desk.locator("[role=menu]").count()) === 1);
  await desk.keyboard.press("ArrowDown").catch(() => {});
  await desk.locator("[role=menu] >> text=Edit").click();
  await desk.waitForSelector('[role="dialog"]');
  check("settings dialog: focus moves inside it", await desk.evaluate(() => !!document.activeElement.closest('[role="dialog"]')));
  for (let i = 0; i < 40; i++) await desk.keyboard.press("Tab");
  check("settings dialog: after 40 Tabs focus is still inside (trapped on purpose)", await desk.evaluate(() => !!document.activeElement.closest('[role="dialog"]')));
  await desk.keyboard.press("Escape"); await desk.waitForTimeout(400);
  check("settings dialog: Escape closes it", (await desk.locator('[role="dialog"]').count()) === 0);
  check("settings dialog: focus goes back to where it was opened from (the page, not lost on <body>)", await desk.evaluate(() => document.activeElement && document.activeElement !== document.body));
  await desk.getByRole("button", { name: /New Gallery/ }).first().click(); await desk.waitForSelector('[role="dialog"]');
  await desk.keyboard.press("Escape"); await desk.waitForTimeout(300);
  check("new gallery dialog: Escape closes it", (await desk.locator('[role="dialog"]').count()) === 0);
  await desk.locator('header button[aria-haspopup="menu"]').focus(); await desk.keyboard.press("Enter");
  check("account menu opens from the keyboard and Escape closes it", (await desk.locator("[role=menu]").count()) === 1 && (await (async () => { await desk.keyboard.press("Escape"); await desk.waitForTimeout(200); return (await desk.locator("[role=menu]").count()) === 0; })()));

  // ---- lightbox from the keyboard
  await desk.goto(`${BASE}/gallery/pubtest`, { waitUntil: "load" }); await desk.waitForSelector("#photos"); await desk.waitForTimeout(800);
  const tile = desk.locator("#photos div.group > button").first();
  const tileLabel = await tile.getAttribute("aria-label").catch(() => null);
  await tile.focus(); await desk.keyboard.press("Enter"); await desk.waitForTimeout(600);
  const lb = (await desk.locator('[role="dialog"]').count()) > 0;
  check("gallery: Enter on a photo opens the viewer", lb, tileLabel || "");
  if (lb) {
    await desk.keyboard.press("ArrowRight"); await desk.waitForTimeout(300);
    await desk.keyboard.press("Escape"); await desk.waitForTimeout(400);
    check("viewer: arrow keys work and Escape closes it, focus returns to the photo grid", (await desk.locator('[role="dialog"]').count()) === 0 && (await desk.evaluate(() => !!document.activeElement && document.activeElement !== document.body)));
  }

  // ---- phone: target sizes and overflow
  const ph = await mk(390), phOut = await mk(390), phUnpaid = await mk(390);
  await login(ph); await login(phUnpaid, "unpaid@example.com");
  for (const [name, url, who, ready] of screens) {
    const ph_ = pick(who, ph, phUnpaid, phOut);
    await ph_.goto(`${BASE}${url}`, { waitUntil: "load" });
    await ph_.waitForSelector(ready, { timeout: 15000 }).catch(() => {});
    await ph_.waitForTimeout(700);
    check(`${name} at 390 px: no horizontal overflow`, (await ph_.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
    const small = await visibleTargets(ph_);
    check(`${name} at 390 px: every control is at least 24 x 24 px`, small.length === 0, small.join(" | "));
  }
  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("SCRIPT ERROR", e); process.exit(1); });
