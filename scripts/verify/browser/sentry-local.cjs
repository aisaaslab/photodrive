/**
 * S0-06 proof without a Sentry account: a local stand-in for Sentry's ingest endpoint collects what the app sends. Expects the server to
 * have been built and started with SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN = http://key@127.0.0.1:18999/1, SENTRY_ENVIRONMENT=staging,
 * VERCEL_GIT_COMMIT_SHA=abc1234567890, SENTRY_TEST_ROUTE=1, APP_ENV=staging and ADMIN_UID=photographer1 (see scratch runner in the evidence).
 * Starts the stand-in itself on :18999, raises the staging test error on the server and a deliberate error in the browser, and checks
 * release, environment, the privacy filter and that the customer's e-mail address and token never appear.
 * Usage: NODE_PATH=$(npm root -g) node sentry-local.cjs
 */
const http = require("node:http");
const zlib = require("node:zlib");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3997";
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " :: " + String(extra).slice(0, 500)}`); if (!ok) failed++; };
const envelopes = [];

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let buf = Buffer.concat(chunks);
    try { if (req.headers["content-encoding"] === "gzip") buf = zlib.gunzipSync(buf); } catch {}
    envelopes.push({ url: req.url, text: buf.toString("utf8") });
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*" });
    res.end("{}");
  });
});
server.on("request", (req, res) => { if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" }); res.end(); } });

async function idToken() {
  const r = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "photographer@example.com", password: "test-password-1", returnSecureToken: true }),
  });
  return (await r.json()).idToken;
}
const events = () => envelopes.flatMap((e) => e.text.split("\n").filter((l) => l.startsWith("{")).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean));

(async () => {
  await new Promise((r) => server.listen(18999, "127.0.0.1", r));
  const token = await idToken();
  const res = await fetch(`${BASE}/api/admin/sentry-test`, { headers: { authorization: `Bearer ${token}`, cookie: "session=SECRETCOOKIE" } });
  check("the staging test route raises its error (500, no message shown)", res.status === 500 && (await res.json()).error === "Internal error", String(res.status));
  await new Promise((r) => setTimeout(r, 3000));
  let ev = events().find((e) => /Sentry test error/.test(JSON.stringify(e.exception || e.message || "")));
  check("the server error arrived at the (stand-in) ingest endpoint", !!ev, `${envelopes.length} envelopes`);
  if (ev) {
    check("…tagged with the release (the commit)", ev.release === "abc1234567890", ev.release);
    check("…tagged with the environment", ev.environment === "staging", ev.environment);
    check("…and with the scope that raised it", ev.tags && (ev.tags.scope === "admin.sentry-test" || JSON.stringify(ev.tags).includes("sentry-test")), JSON.stringify(ev.tags));
    const raw = JSON.stringify(ev);
    check("…without the cookie, authorization header, user or e-mail", !/SECRETCOOKIE|photographer@example\.com/.test(raw) && !ev.user && !(ev.request && ev.request.headers && (ev.request.headers.authorization || ev.request.headers.cookie)), raw.slice(0, 400));
  }

  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(`${BASE}/gallery/pubtest?token=SHOULDNOTLEAK`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { setTimeout(() => { throw new Error("Browser test error for jane@example.com (S0-06)"); }, 10); });
  await page.waitForTimeout(3500);
  const bev = events().find((e) => /Browser test error/.test(JSON.stringify(e.exception || "")));
  check("an error in the browser arrives too", !!bev, `${envelopes.length} envelopes`);
  if (bev) {
    check("…with release and environment", bev.release === "abc1234567890" && bev.environment === "staging", `${bev.release} ${bev.environment}`);
    const raw = JSON.stringify(bev);
    check("…with the e-mail address masked and no token in the URL", !/jane@example\.com/.test(raw) && !/SHOULDNOTLEAK/.test(raw), raw.slice(0, 400));
    check("…and no user identity", !bev.user, JSON.stringify(bev.user));
  }
  await browser.close();
  server.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("SCRIPT ERROR", e); process.exit(1); });
