import { NextRequest, NextResponse } from "next/server";
import { clientIp, getRateLimiter } from "@/lib/server/rate-limit";
import { requestLogger } from "@/lib/server/log";

const MAX_BYTES = 10_000;

/** Origin and path only: query strings and fragments can carry identifiers (for example a checkout session id), which must not be logged. */
function clean(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    const u = new URL(value);
    return `${u.origin}${u.pathname}`.slice(0, 200);
  } catch {
    return value.split("?")[0].split("#")[0].slice(0, 80); // "inline", "eval", "data", "self" ...
  }
}

/** Browser extensions and injected scripts cause reports that are not about our site. */
const NOISE = /^(chrome-extension|moz-extension|safari-extension|safari-web-extension|webkit-masked-url|about):/i;

type Violation = { directive: string; blocked: string; document: string; source: string };

/** Reads both formats browsers send: the legacy `csp-report` object and the Reporting API's array of `csp-violation` reports. */
function violations(body: unknown): Violation[] {
  const out: Violation[] = [];
  const add = (r: Record<string, unknown>) => {
    const directive = String(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? r.violatedDirective ?? "").slice(0, 60);
    const blockedRaw = String(r["blocked-uri"] ?? r.blockedURL ?? r.blockedUri ?? "");
    const sourceRaw = String(r["source-file"] ?? r.sourceFile ?? "");
    if (NOISE.test(blockedRaw) || NOISE.test(sourceRaw)) return;
    out.push({
      directive,
      blocked: clean(blockedRaw),
      document: clean(r["document-uri"] ?? r.documentURL ?? r.documentUri),
      source: clean(sourceRaw),
    });
  };
  if (Array.isArray(body)) {
    for (const item of body.slice(0, 10)) {
      const b = (item as { body?: unknown })?.body;
      if (b && typeof b === "object") add(b as Record<string, unknown>);
    }
  } else if (body && typeof body === "object") {
    const r = (body as Record<string, unknown>)["csp-report"];
    if (r && typeof r === "object") add(r as Record<string, unknown>);
  }
  return out;
}

/**
 * Receives Content-Security-Policy violation reports (S3-08). Public by nature (browsers post here without credentials), so it is
 * small, rate limited, stores nothing, and logs only a short line per violation: the directive, and the origin and path (never
 * the query string) of what was blocked and of the page.
 */
export async function POST(req: NextRequest) {
  const limit = await getRateLimiter().limit({ name: "csp-report", id: clientIp(req), limit: 60, windowSec: 60 });
  if (!limit.allowed) return new NextResponse(null, { status: 429 });

  const text = await req.text();
  if (text.length > MAX_BYTES) return new NextResponse(null, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const log = requestLogger(req, "csp-report");
  for (const v of violations(body)) {
    log.warn("csp violation", { directive: v.directive, blocked: v.blocked, document: v.document, source: v.source });
  }
  return new NextResponse(null, { status: 204 });
}
