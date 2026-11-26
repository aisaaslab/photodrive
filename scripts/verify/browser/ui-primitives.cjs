/**
 * S5-03 browser check of the UI primitives on /dev/ui (server started with SHOW_DEV_UI=1): real hover, keyboard focus, disabled,
 * keyboard navigation and ARIA state, plus no horizontal overflow at 1440, 1024 and 390. Set SHOT=<dir> to save screenshots.
 */
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3997";
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`); if (!ok) failed++; };
const css = (loc, prop) => loc.evaluate((el, p) => getComputedStyle(el)[p], prop);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/dev/ui`, { waitUntil: "networkidle" });

  // Fonts and tokens are applied
  check("Manrope is the page font", (await css(page.locator("main"), "fontFamily")).includes("Manrope"));
  check("canvas background is #06080c", (await css(page.locator("main"), "backgroundColor")) === "rgb(6, 8, 12)");

  // Button: hover, focus, disabled, loading, link
  const primary = page.getByRole("button", { name: "primary", exact: true });
  const idle = await css(primary, "filter");
  await primary.hover();
  await page.waitForTimeout(250);
  check("primary hover brightens", (await css(primary, "filter")) !== idle, `${idle} -> ${await css(primary, "filter")}`);
  await page.mouse.move(0, 0);
  await page.keyboard.press("Tab");
  await primary.focus();
  await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
  check("keyboard focus shows a ring", (await css(primary, "boxShadow")) !== "none");
  check("disabled buttons are disabled", await page.getByRole("button", { name: "primary disabled" }).isDisabled());
  const loading = page.getByRole("button", { name: "Loading" });
  check("loading button is disabled and busy", (await loading.isDisabled()) && (await loading.getAttribute("aria-busy")) === "true");
  check("link variant renders an <a>", (await page.getByRole("link", { name: "As a link" }).count()) === 1);

  // Chip toggle, Toggle switch, Tabs, Accordion, Input
  const chip = page.getByRole("button", { name: /Click me/ });
  await chip.click(); check("chip toggles aria-pressed", (await chip.getAttribute("aria-pressed")) === "true");
  const sw = page.getByRole("switch", { name: "Allow downloads" });
  check("switch starts on", (await sw.getAttribute("aria-checked")) === "true");
  await sw.click(); check("switch turns off on click", (await sw.getAttribute("aria-checked")) === "false");
  await sw.focus(); await page.keyboard.press("Space"); check("switch turns on with Space", (await sw.getAttribute("aria-checked")) === "true");
  check("disabled switch is disabled", await page.getByRole("switch", { name: "Disabled" }).isDisabled());

  const tabAll = page.getByRole("tab", { name: /^All/ });
  await tabAll.focus(); await page.keyboard.press("ArrowRight");
  check("ArrowRight selects the next tab and moves focus", (await page.getByRole("tab", { name: /Favorites/ }).getAttribute("aria-selected")) === "true" && (await page.evaluate(() => document.activeElement?.textContent)).includes("Favorites"));
  await page.keyboard.press("End"); check("End selects the last tab", (await page.getByRole("tab", { name: /Download all/ }).getAttribute("aria-selected")) === "true");
  await page.keyboard.press("ArrowRight"); check("ArrowRight wraps to the first", (await tabAll.getAttribute("aria-selected")) === "true");
  check("only the selected tab is in the tab order", (await page.getByRole("tab", { name: /Favorites/ }).getAttribute("tabindex")) === "-1");

  const q1 = page.getByRole("button", { name: "Do my clients need an account?" });
  const q2 = page.getByRole("button", { name: "Where are my photos stored?" });
  check("accordion: first open, second closed", (await q1.getAttribute("aria-expanded")) === "true" && (await q2.getAttribute("aria-expanded")) === "false");
  await q2.click(); check("accordion: click opens the second and keeps the first", (await q2.getAttribute("aria-expanded")) === "true" && (await q1.getAttribute("aria-expanded")) === "true");
  await q1.click(); check("accordion: click closes", (await q1.getAttribute("aria-expanded")) === "false");
  check("accordion: answers stay in the DOM", (await page.getByText("Nothing is uploaded again.").count()) === 1);
  const region = page.getByRole("region", { name: "Where are my photos stored?" });
  check("accordion: answer is a labelled region", (await region.count()) === 1);

  const pw = page.getByRole("textbox", { name: "Password" });
  check("input error sets aria-invalid and a description", (await pw.getAttribute("aria-invalid")) === "true" && !!(await pw.getAttribute("aria-describedby")));
  check("input label is wired to the field", (await page.getByLabel("Gallery name").count()) === 1);
  check("disabled input is disabled", await page.getByRole("textbox", { name: "Disabled" }).isDisabled());

  // Toasts
  await page.getByRole("button", { name: "Success toast" }).click();
  check("toast appears in a live region", await page.getByRole("status").getByText("Link copied").isVisible());

  // Layout at the three review widths: nothing wider than the screen
  for (const w of [1440, 1024, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(150);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`no horizontal overflow at ${w}px`, over <= 0, `${over}px`);
    if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/ui-${w}.png`, fullPage: true });
  }
  check("no page errors", errors.length === 0, errors.join("; ").slice(0, 200));

  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
})();
