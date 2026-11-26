// Behaviour snapshot of the public gallery page in a real browser (S5-08 / S5-10: split big components with no behaviour change).
// Prints a JSON document of observable facts: tile counts and names, labels, storage, API payloads, lightbox state. Run it before and
// after a refactor and compare: identical output means no visible change. Needs the seeded "bigtest" gallery and the server from README.md.
//   node gallery-snapshot.cjs > snapshot.json
const { chromium } = require("playwright");
const BASE = "http://localhost:3997";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const posts = [];
  page.on("request", (r) => { if (r.url().includes("/selection") && r.method() === "POST") posts.push(JSON.parse(r.postData() || "{}")); });
  const out = {};
  const step = (name, value) => { out[name] = value; console.error("ok:", name); };

  const tiles = () => page.evaluate(() => {
    const names = (els) => els.map((e) => (e.querySelector("span.truncate")?.textContent ?? "").trim());
    const photos = [...document.querySelectorAll(".photo-grid > *")];
    const videos = [...document.querySelectorAll("div.grid.gap-2\\.5 > *")];
    const all = [...photos, ...videos];
    return { photos: photos.length, videos: videos.length, first: names(all).slice(0, 3), last: names(all).slice(-2) };
  });
  const bar = () => page.evaluate(() => ({
    tabs: [...document.querySelectorAll("[data-ui=filter-tabs] button")].map((b) => b.textContent.replace(/\s+/g, " ").trim() + (b.getAttribute("aria-pressed") === "true" ? " [on]" : "")),
    count: (document.querySelector("p.hidden.md\\:block")?.textContent ?? "").trim(),
    loadMore: [...document.querySelectorAll("button")].find((b) => /\(\d+\)$/.test(b.textContent.trim()) && /Show more/i.test(b.textContent))?.textContent.trim() ?? null,
    sendSelection: [...document.querySelectorAll("[data-ui=send-selection-bar] button")].map((b) => b.textContent.replace(/\s+/g, " ").trim()),
    hasSearch: !!document.querySelector("input[type=text]"),
    sortOptions: [...document.querySelectorAll("select option")].map((o) => o.textContent.trim()),
  }));
  const lightbox = () => page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return null;
    const img = d.querySelector("img[alt]:not([alt=''])");
    const strip = [...d.querySelectorAll("button[aria-label*=' / ']")];
    return {
      counter: d.querySelector("[data-ui=lightbox-counter]")?.textContent.replace(/\s+/g, " ").trim(),
      imgAlt: img?.getAttribute("alt") ?? null,
      imgSrc: (img?.getAttribute("src") ?? "").replace(/=s\d+/, "=sN"),
      video: !!d.querySelector("video, iframe"),
      favoritePressed: [...d.querySelectorAll("button[aria-pressed]")].map((b) => b.getAttribute("aria-pressed")),
      download: [...d.querySelectorAll("a[download]")].map((a) => a.getAttribute("href")),
      strip: strip.length,
      activeStrip: strip.findIndex((b) => /ring|border-white|opacity-100/.test(b.className)),
      transform: img ? (img.parentElement?.getAttribute("style") ?? "") + "|" + (img.getAttribute("style") ?? "") : null,
    };
  });

  await page.goto(`${BASE}/gallery/bigtest`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  step("1 initial", { tiles: await tiles(), bar: await bar() });

  await page.click("text=/Show more/");
  await page.waitForTimeout(300);
  step("2 after load more", { tiles: await tiles(), bar: await bar() });

  // search
  await page.fill("input[type=text]", "IMG_01");
  step("3 search IMG_01", { tiles: await tiles(), count: (await bar()).count });
  await page.fill("input[type=text]", "zzz-nothing");
  step("4 search with no result", { tiles: await tiles(), empty: await page.evaluate(() => document.querySelector("[data-ui=empty-state] p")?.textContent ?? null) });
  await page.fill("input[type=text]", "");

  // sort
  await page.selectOption("select", "nameDesc");
  step("5 sort Z-A", await tiles());
  await page.selectOption("select", "name");
  step("6 sort A-Z", await tiles());
  await page.selectOption("select", "default");

  // folder filter
  await page.click('button[aria-haspopup="listbox"]:not([aria-label^="Language"])');
  step("7 folder options", await page.$$eval('[role="option"]', (els) => els.map((e) => e.textContent.trim())));
  await page.click('[role="option"]:has-text("Sub")');
  step("8 folder Sub", { tiles: await tiles(), bar: await bar() });
  await page.click('button[aria-haspopup="listbox"]:not([aria-label^="Language"])');
  await page.click('[role="option"]').catch(() => {});
  await page.waitForTimeout(200);
  step("9 folder reset", (await tiles()).photos + "/" + (await tiles()).videos);

  // type tabs
  await page.click("[data-ui=filter-tabs] button:has-text('Videos')");
  step("10 videos tab", await tiles());
  await page.click("[data-ui=filter-tabs] button:has-text('Photos')");
  step("11 photos tab", await tiles());
  await page.click("[data-ui=filter-tabs] button:has-text('All')");

  // selection mode
  await page.click('button[aria-label="Select"]');
  step("12 select mode on", await page.evaluate(() => [...document.querySelectorAll("[data-ui=toolbar] button")].map((b) => b.textContent.replace(/\s+/g, " ").trim())));
  await page.click("text=Select all");
  step("13 select all", await page.evaluate(() => ({ text: document.querySelector("[data-ui=selection-count]")?.textContent.replace(/\s+/g, " ").trim() ?? null, toggle: [...document.querySelectorAll("[data-ui=toolbar] button")].map((b) => b.textContent.trim()).filter(Boolean).slice(-2) })));
  await page.click("text=Deselect all");
  step("14 deselect all", await page.evaluate(() => document.querySelector("[data-ui=selection-count]") === null));
  await page.click('button[aria-label="Cancel"]');
  step("15 select mode off", await page.evaluate(() => document.querySelector('button[aria-label="Select"]') !== null));

  // favourites
  const heart = page.locator('button[aria-label="Add to favorites"]').first();
  const heartLabel = await heart.getAttribute("aria-label");
  await heart.click();
  await page.waitForTimeout(400);
  step("16 favourite one", { label: heartLabel, posts: [...posts], storage: await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith("favorites_")).map(([k, v]) => [k.replace(/_[^_]+$/, "_ID"), JSON.parse(v).length]))), bar: await bar() });
  await page.click("[data-ui=filter-tabs] button:has-text('Favorites')");
  step("17 favourites tab", { tiles: await tiles(), note: await page.evaluate(() => document.querySelector("[data-ui=favorites-note]")?.textContent.trim() ?? null) });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  step("18 after reload (server remembers)", await bar());
  await page.click("[data-ui=filter-tabs] button:has-text('Favorites')");
  step("19 favourites after reload", await tiles());

  // lightbox on the favourites view (a one-photo snapshot), then on All
  await page.click(".photo-grid > *:first-child");
  await page.waitForTimeout(500);
  step("20 lightbox from favourites", await lightbox());
  await page.keyboard.press("ArrowRight");
  step("21 ArrowRight stays within the favourites snapshot", (await lightbox()).counter);
  await page.keyboard.press("Escape");
  step("22 Escape closes", await lightbox());
  await page.click("[data-ui=filter-tabs] button:has-text('All')");
  await page.click(".photo-grid > *:nth-child(3)");
  await page.waitForTimeout(500);
  step("23 lightbox on tile 3", await lightbox());
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  step("24 after two ArrowRight", await lightbox());
  await page.keyboard.press("ArrowLeft");
  step("25 after ArrowLeft", (await lightbox()).counter);
  await page.click('[role="dialog"] button[aria-label="10 / 130"]').catch(() => {});
  step("26 thumbnail strip jump", (await lightbox())?.counter ?? null);
  // zoom
  await page.keyboard.press("+");
  await page.waitForTimeout(250);
  step("27 zoom in (+)", (await lightbox()).transform);
  await page.keyboard.press("0");
  await page.waitForTimeout(250);
  step("28 zoom reset (0)", (await lightbox()).transform);
  await page.click('[role="dialog"] button[aria-label="Zoom"]');
  await page.waitForTimeout(250);
  step("29 zoom button", (await lightbox()).transform);
  await page.click('[role="dialog"] button[aria-label="Zoom"]');
  // favourite inside the lightbox
  await page.click('[role="dialog"] button[aria-pressed]:has-text("Favorite")');
  await page.waitForTimeout(300);
  step("30 favourite in lightbox", { lightbox: (await lightbox()).favoritePressed, posts: posts.length });
  // slideshow advances by itself
  const before = (await lightbox()).counter;
  await page.click('[role="dialog"] button[title="Slideshow"]');
  await page.waitForTimeout(4600);
  step("31 slideshow advanced", before !== (await lightbox()).counter);
  await page.click('[role="dialog"] button[title="Slideshow"], [role="dialog"] button:has-text("Slideshow")').catch(() => {});
  // video in the lightbox
  await page.keyboard.press("Escape");
  await page.click("[data-ui=filter-tabs] button:has-text('Videos')");
  await page.click("div.grid.gap-2\\.5 > *:first-child");
  await page.waitForTimeout(400);
  step("32 video lightbox", await lightbox());
  await page.click('[role="dialog"] button[aria-label="Close"]').catch(() => page.keyboard.press("Escape"));
  step("33 closed", await lightbox());

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error("SNAPSHOT FAILED:", e.message.split("\n").slice(0, 3).join(" | ")); process.exit(1); });
