const { chromium } = require("playwright");
const BASE = "http://localhost:3997";
const IDS = ["1DriveImageFileIdAAAAAAAAAAAAAAAAAAA", "1DriveImageFileIdBBBBBBBBBBBBBBBBBBB", "1DriveVideoFileIdCCCCCCCCCCCCCCCCCCC", "1DriveFolderIdDDDDDDDDDDDDDDDDDDDDDD", "AAAAsecret", "BBBBsecret", "CCCCsecret"];
const HOSTS = ["googleusercontent", "drive.usercontent", "drive.google.com/thumbnail", "drive.google.com/file", "lh3."];
const findLeaks = (text) => [...IDS, ...HOSTS].filter((n) => text.includes(n));

async function visit(browser, slug, { unlock } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const requests = [];
  const failures = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400) failures.push(`${r.status()} ${r.url().replace(BASE, "")}`); });
  // Anything that is not our own server is unreachable from here; fail it fast (and it shows up in `requests`).
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
  await page.goto(`${BASE}/gallery/${slug}`, { waitUntil: "load" });
  const lockedHtml = await page.content();
  if (unlock) {
    await page.fill("input[type=password]", "hunter2");
    await Promise.all([page.waitForResponse((r) => r.url().includes("/api/gallery/verify-password")), page.click("button[type=submit]")]);
    await page.waitForTimeout(500);
    await page.goto(`${BASE}/gallery/${slug}`, { waitUntil: "networkidle" });
  } else {
    await page.waitForLoadState("networkidle");
  }
  await page.waitForTimeout(800);
  return { ctx, page, requests, failures, lockedHtml };
}

(async () => {
  const browser = await chromium.launch();
  let bad = 0;
  const check = (label, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`); if (!ok) bad++; };

  // 1. private gallery
  {
    const { ctx, page, requests, failures, lockedHtml } = await visit(browser, "privtest", { unlock: true });
    check("private, locked page: no photo data or Drive id", findLeaks(lockedHtml).length === 0 && !lockedHtml.includes("/api/g/"), findLeaks(lockedHtml).join(","));
    const html = await page.content();
    const imgs = await page.$$eval("img", (els) => els.map((e) => ({ src: e.getAttribute("src") || "", w: e.naturalWidth })));
    const protectedImgs = imgs.filter((i) => i.src.startsWith("/api/g/"));
    check("private, unlocked: photos are on /api/g/…", protectedImgs.length >= 2, `${protectedImgs.length} images`);
    check("private, unlocked: the images actually loaded", protectedImgs.every((i) => i.w > 0), JSON.stringify(protectedImgs.map((i) => i.w)));
    check("private, unlocked: rendered HTML + RSC payload contain no Drive id / Google image or Drive URL", findLeaks(html).length === 0, findLeaks(html).join(","));
    const external = requests.filter((u) => !u.startsWith(BASE));
    check("private, unlocked: network log has no googleusercontent/drive.* request", external.filter((u) => /google|drive|gstatic/.test(u) && !/googletagmanager|google-analytics|vercel/.test(u)).length === 0, external.join(" | ").slice(0, 300));
    check("private, unlocked: no request URL contains a Drive id", requests.filter((u) => findLeaks(u).length).length === 0);
    check("private, unlocked: no 4xx/5xx from the API", failures.length === 0, failures.join(" | "));

    // download link and a favourite
    const dl = await page.$$eval("a[download]", (els) => els.map((e) => e.getAttribute("href")));
    check("private, unlocked: download links are signed same-site URLs", dl.length >= 1 && dl.every((h) => h.startsWith("/api/g/") && h.includes("size=full")), `${dl.length} links`);
    const status = await page.evaluate(async (h) => (await fetch(h)).status, dl[0]);
    check("private, unlocked: an original downloads with the cookie", status === 200, `status ${status}`);
    // without the cookie (fresh context) the same signed URL is refused
    const anon = await browser.newContext();
    const anonRes = await anon.request.get(BASE + dl[0]);
    check("private: the same signed URL without the cookie is 401", anonRes.status() === 401, `status ${anonRes.status()}`);
    // a thumbnail URL is refused when tampered with
    const thumb = protectedImgs[0].src;
    const forged = await page.evaluate(async (u) => (await fetch(u.replace(/s=[^&]+/, "s=AAAAAAAAAAAAAAAAAAAAAA"))).status, thumb);
    check("private: a tampered signature is 403", forged === 403, `status ${forged}`);
    await anon.close();

    // lightbox: open the first photo, then reach the video
    await page.click(".photo-grid > *:first-child");
    await page.waitForTimeout(800);
    const lbImg = await page.$$eval("img", (els) => els.map((e) => e.getAttribute("src") || "").filter((s) => s.includes("size=preview")));
    check("private: the lightbox shows a signed preview", lbImg.length >= 1, `${lbImg.length}`);
    const afterLightbox = await page.content();
    check("private: still no Drive id after opening the lightbox", findLeaks(afterLightbox).length === 0, findLeaks(afterLightbox).join(","));
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(800);
    const video = await page.$$eval("video", (els) => els.map((e) => e.getAttribute("src")));
    const iframes = await page.$$eval("iframe", (els) => els.map((e) => e.getAttribute("src") || ""));
    check("private: the video plays from a signed same-site stream, with no Drive iframe", video.length === 1 && String(video[0]).includes("size=stream") && !iframes.some((s) => s.includes("drive.google")), JSON.stringify({ video, iframes }));
    await page.keyboard.press("Escape");

    // favourite a photo and read it back
    const heart = await page.$('button[aria-label*="avorite" i], button[aria-label*="avourite" i]');
    if (heart) {
      const posted = page.waitForResponse((r) => r.url().includes("/selection") && r.request().method() === "POST");
      await heart.click({ force: true });
      const resp = await posted;
      const sent = resp.request().postData() || "";
      check("private: a favourite is sent as a token, not a Drive id", resp.status() === 200 && findLeaks(sent).length === 0, `status ${resp.status()} body ${sent.slice(0, 120)}`);
    } else {
      check("private: favourite button found", false);
    }
    await ctx.close();
  }

  // 2. public gallery, downloads off
  {
    const { ctx, page, requests } = await visit(browser, "nodltest");
    const html = await page.content();
    check("downloads off: no Drive id in the page", findLeaks(html).length === 0, findLeaks(html).join(","));
    const dl = await page.$$eval("a[download]", (els) => els.length);
    check("downloads off: no download links", dl === 0, `${dl}`);
    check("downloads off: no original URL in the page", !html.includes("size=full"));
    check("downloads off: network log has no Google image request", requests.filter((u) => /googleusercontent|drive\./.test(u)).length === 0);
    await ctx.close();
  }

  // 3. public gallery with downloads: exactly as before
  {
    const { ctx, page } = await visit(browser, "pubtest");
    const html = await page.content();
    check("public: still delivered from Google (ids and CDN links present, nothing from /api/g/)", html.includes(IDS[0]) && html.includes("googleusercontent") && !html.includes("/api/g/"));
    await ctx.close();
  }
  await browser.close();
  console.log(bad ? `\n${bad} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exit(bad ? 1 : 0);
})();
