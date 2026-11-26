// Real-browser check of "select photos, download as .zip" (S5-11: the browser zip is built with client-zip). Run after seed.cjs and with the
// server from README.md running. Saves the file Chromium receives and reads its zip structure.
const { chromium } = require("playwright");
const fs = require("node:fs");
const BASE = "http://localhost:3997";

function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32);
    names.push(buf.subarray(p + 46, p + 46 + nameLen).toString("utf8"));
    p += 46 + nameLen + extra + comment;
  }
  return names;
}

(async () => {
  const browser = await chromium.launch();
  let bad = 0;
  const check = (label, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`); if (!ok) bad++; };

  for (const { slug, unlock } of [{ slug: "pubtest" }, { slug: "privtest", unlock: true }]) {
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await page.goto(`${BASE}/gallery/${slug}`, { waitUntil: "load" });
    if (unlock) {
      await page.fill("input[type=password]", "hunter2");
      await Promise.all([page.waitForResponse((r) => r.url().includes("/api/gallery/verify-password")), page.click("button[type=submit]")]);
      await page.waitForTimeout(400);
      await page.goto(`${BASE}/gallery/${slug}`, { waitUntil: "networkidle" });
    }
    await page.waitForTimeout(600);
    await page.click('button[aria-label="Select"]');
    await page.click("text=Select all");
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click("button:has-text('(.zip)')")]);
    const file = `/tmp/claude-zip-${slug}.zip`;
    await download.saveAs(file);
    const buf = fs.readFileSync(file);
    const names = readZip(buf);
    check(`${slug}: a .zip downloads`, download.suggestedFilename().endsWith(".zip"), download.suggestedFilename());
    check(`${slug}: it is a valid zip with the three files`, !!names && names.length === 3 && ["a.jpg", "b.jpg", "c.mp4"].every((n) => names.includes(n)), JSON.stringify(names));
    check(`${slug}: the files have content`, buf.length > 200, `${buf.length} bytes`);
    fs.unlinkSync(file);
    await ctx.close();
  }
  await browser.close();
  console.log(bad ? `\n${bad} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exit(bad ? 1 : 0);
})();
