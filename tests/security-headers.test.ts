import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import nextConfig from "@/next.config";

type Rule = { source: string; headers: { key: string; value: string }[] };

async function rules(env: "production" | "development"): Promise<Rule[]> {
  vi.stubEnv("NODE_ENV", env);
  return (await nextConfig.headers!()) as Rule[];
}
const header = (rule: Rule | undefined, key: string) => rule?.headers.find((h) => h.key === key)?.value;
const directive = (policy: string, name: string) =>
  policy.split(";").map((d) => d.trim()).find((d) => d === name || d.startsWith(`${name} `)) ?? "";

afterEach(() => vi.unstubAllEnvs());

describe("security headers (S3-08)", () => {
  it("every route, API included, gets the basic headers", async () => {
    const all = (await rules("production")).find((r) => r.source === "/:path*");
    expect(header(all, "X-Content-Type-Options")).toBe("nosniff");
    expect(header(all, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header(all, "X-Frame-Options")).toBe("SAMEORIGIN");
    const perms = header(all, "Permissions-Policy")!;
    for (const feature of ["camera=()", "microphone=()", "geolocation=()", "payment=()"]) expect(perms).toContain(feature);
  });

  it("framing is restricted by an ENFORCED policy (frame-ancestors is ignored in report-only mode)", async () => {
    const all = (await rules("production")).find((r) => r.source === "/:path*");
    expect(header(all, "Content-Security-Policy")).toBe("frame-ancestors 'self'");
  });

  it("the full CSP is report-only, on pages only (not the API), and only in production", async () => {
    const prod = await rules("production");
    const page = prod.find((r) => r.source !== "/:path*");
    expect(page, "a page rule exists in production").toBeDefined();
    expect(header(page, "Content-Security-Policy-Report-Only")).toBeTruthy();
    expect(header(page, "Content-Security-Policy"), "the full policy must not be enforced yet").toBeUndefined();
    expect(header(page, "Reporting-Endpoints")).toBe('csp="/api/csp-report"');
    const regex = new RegExp(`^${page!.source.replace(/\//g, "\\/")}$`);
    expect(regex.test("/gallery/abc")).toBe(true);
    expect(regex.test("/")).toBe(true);
    expect(regex.test("/api/stripe/webhook")).toBe(false);

    const dev = await rules("development");
    expect(dev.some((r) => header(r, "Content-Security-Policy-Report-Only"))).toBe(false); // the dev server needs eval
  });

  it("the policy is tight where it matters", async () => {
    const policy = header((await rules("production")).find((r) => r.source !== "/:path*"), "Content-Security-Policy-Report-Only")!;
    expect(directive(policy, "default-src")).toBe("default-src 'self'");
    expect(directive(policy, "object-src")).toBe("object-src 'none'");
    expect(directive(policy, "base-uri")).toBe("base-uri 'self'");
    expect(directive(policy, "frame-ancestors")).toBe("frame-ancestors 'self'");
    expect(directive(policy, "form-action")).toContain("https://checkout.stripe.com");
    expect(policy).not.toContain("unsafe-eval");
    expect(directive(policy, "script-src")).not.toMatch(/(^| )\*( |$)|http:|data:/); // no bare wildcard, no plain http, no data: scripts
    expect(directive(policy, "font-src")).toBe("font-src 'self' data:"); // fonts are self-hosted: no Google font hosts
    expect(policy).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(policy).toContain("report-uri /api/csp-report");
  });

  it("allows what the app really loads", async () => {
    const policy = header((await rules("production")).find((r) => r.source !== "/:path*"), "Content-Security-Policy-Report-Only")!;
    expect(directive(policy, "script-src")).toContain("https://www.googletagmanager.com");
    expect(directive(policy, "script-src")).toContain("https://connect.facebook.net");
    expect(directive(policy, "script-src")).toContain("https://apis.google.com"); // Google sign-in popup
    expect(directive(policy, "img-src")).toContain("https://*.googleusercontent.com"); // gallery photos
    expect(directive(policy, "frame-src")).toContain("https://drive.google.com"); // video preview
    expect(directive(policy, "frame-src")).toContain("https://accounts.google.com");
    expect(directive(policy, "connect-src")).toContain("https://*.googleapis.com"); // Firestore, Identity Toolkit
    expect(directive(policy, "media-src")).toContain("https://drive.usercontent.google.com");
  });

  it("does not advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

describe("POST /api/csp-report", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  let n = 0;
  const send = async (body: string, contentType = "application/csp-report") => {
    const { POST } = await import("@/app/api/csp-report/route");
    return POST(new NextRequest("http://localhost/api/csp-report", { method: "POST", headers: { "content-type": contentType, "x-real-ip": `192.0.2.${++n}` }, body }));
  };
  const logged = () => (console.warn as unknown as { mock: { calls: string[][] } }).mock.calls.map((c) => JSON.parse(c[0]));

  it("accepts the legacy report format, answers 204 and logs one short line without the query string", async () => {
    const res = await send(JSON.stringify({
      "csp-report": {
        "document-uri": "https://app.example.com/thank-you?session_id=cs_live_SECRET123",
        "violated-directive": "img-src",
        "effective-directive": "img-src",
        "blocked-uri": "https://tracker.example.net/pixel.gif?uid=42#frag",
        "source-file": "https://app.example.com/_next/static/chunk.js?v=1",
      },
    }));
    expect(res.status).toBe(204);
    const lines = logged();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      msg: "csp violation", directive: "img-src", blocked: "https://tracker.example.net/pixel.gif", document: "https://app.example.com/thank-you",
    });
    expect(JSON.stringify(lines)).not.toMatch(/cs_live_SECRET123|uid=42|#frag/);
  });

  it("accepts the Reporting API format (an array) too", async () => {
    const res = await send(
      JSON.stringify([{ type: "csp-violation", body: { documentURL: "https://app.example.com/dashboard?x=1", effectiveDirective: "script-src-elem", blockedURL: "inline" } }]),
      "application/reports+json",
    );
    expect(res.status).toBe(204);
    expect(logged()[0]).toMatchObject({ directive: "script-src-elem", blocked: "inline", document: "https://app.example.com/dashboard" });
  });

  it("ignores reports caused by browser extensions", async () => {
    await send(JSON.stringify({ "csp-report": { "blocked-uri": "chrome-extension://abc/inject.js", "effective-directive": "script-src-elem" } }));
    await send(JSON.stringify({ "csp-report": { "blocked-uri": "inline", "source-file": "moz-extension://abc/x.js", "effective-directive": "script-src-elem" } }));
    expect(logged()).toHaveLength(0);
  });

  it("rejects an oversized body (413) and a body that is not JSON (400), and stores nothing", async () => {
    expect((await send("x".repeat(10_001))).status).toBe(413);
    expect((await send("{nope")).status).toBe(400);
    expect(logged()).toHaveLength(0);
  });

  it("shrugs off JSON of the wrong shape", async () => {
    for (const body of ["null", "5", '"text"', "[]", "{}", '{"csp-report":5}', '[{"body":null},5]']) expect((await send(body)).status, body).toBe(204);
    expect(logged()).toHaveLength(0);
  });

  it("is rate limited per visitor", async () => {
    const { POST } = await import("@/app/api/csp-report/route");
    const ip = "192.0.2.250";
    const post = () => POST(new NextRequest("http://localhost/api/csp-report", { method: "POST", headers: { "x-real-ip": ip }, body: "{}" }));
    for (let i = 0; i < 60; i++) expect((await post()).status).toBe(204);
    expect((await post()).status).toBe(429);
  });
});
