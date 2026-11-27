/**
 * Error-monitoring settings and privacy rules (S0-06). Pure, so the same code is used by the browser, server and edge setups and is
 * unit-tested. Monitoring is INERT until a DSN is set: without one nothing is initialised and nothing leaves the app.
 */

/** The DSN to use, or null (monitoring off). `NEXT_PUBLIC_SENTRY_DSN` serves the browser (and the server when `SENTRY_DSN` is unset). */
export function sentryDsn(env: Record<string, string | undefined>, side: "server" | "browser"): string | null {
  const v = (side === "server" ? env.SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN : env.NEXT_PUBLIC_SENTRY_DSN) ?? "";
  return /^https?:\/\/\S+@\S+\/\d+$/.test(v.trim()) ? v.trim() : null;
}

/** The environment tag: `SENTRY_ENVIRONMENT`, else `APP_ENV`, else the Node mode, so staging and production are never mixed. */
export function sentryEnvironment(env: Record<string, string | undefined>): string {
  return (env.SENTRY_ENVIRONMENT || env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || env.APP_ENV || env.NODE_ENV || "development").trim().slice(0, 40);
}

/** The release is the commit being served, so an error can be tied to the change that caused it. */
export function sentryRelease(env: Record<string, string | undefined>): string | undefined {
  const v = env.SENTRY_RELEASE || env.NEXT_PUBLIC_SENTRY_RELEASE || env.VERCEL_GIT_COMMIT_SHA || env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  return v ? v.trim().slice(0, 64) : undefined;
}

/** Share of requests traced for performance; errors are always sent. Small on purpose (cost and privacy). */
export function sentryTracesSampleRate(env: Record<string, string | undefined>): number {
  const n = Number(env.SENTRY_TRACES_SAMPLE_RATE);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.05;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SENSITIVE_HEADER = /^(authorization|cookie|set-cookie|x-forwarded-for|x-real-ip|stripe-signature|x-firebase.*|proxy-authorization)$/i;
const SENSITIVE_QUERY = /^(token|t|sig|signature|key|password|pw|code|session_id|session|id_token|access_token|api_key|apikey)$/i;

/** `jane@example.com` inside any text becomes `[email]`. */
export function scrubText(text: string): string {
  return text.replace(EMAIL, "[email]");
}

function scrubUrl(url: string): string {
  try {
    const u = new URL(url, "http://x");
    let changed = false;
    for (const k of [...u.searchParams.keys()]) if (SENSITIVE_QUERY.test(k)) { u.searchParams.set(k, "[removed]"); changed = true; }
    if (!changed) return scrubText(url);
    return scrubText(url.startsWith("http") ? u.toString() : u.pathname + u.search);
  } catch {
    return scrubText(url);
  }
}

type AnyEvent = {
  user?: unknown;
  request?: { url?: string; headers?: Record<string, string>; cookies?: unknown; data?: unknown; query_string?: unknown; env?: unknown };
  message?: string;
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  server_name?: string;
};

/**
 * The privacy filter every event passes through before it is sent (`beforeSend`): no user identity, no IP, no cookies, no request body,
 * no authorization or signature headers, no secret-looking query parameters, no e-mail addresses in messages. What remains is the error,
 * where it happened, the route, and the release / environment: enough to fix it, nothing about the customer.
 */
export function scrubEvent<T extends AnyEvent>(event: T): T {
  delete event.user;
  delete event.server_name;
  if (event.request) {
    const r = event.request;
    delete r.cookies; delete r.data; delete r.query_string; delete r.env;
    if (r.headers) for (const k of Object.keys(r.headers)) if (SENSITIVE_HEADER.test(k)) delete r.headers[k];
    if (r.url) r.url = scrubUrl(r.url);
  }
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = scrubText(ex.value);
  for (const b of event.breadcrumbs ?? []) {
    if (b.message) b.message = scrubText(b.message);
    if (b.data) {
      for (const k of Object.keys(b.data)) {
        const v = b.data[k];
        if (typeof v === "string") b.data[k] = k === "url" || k === "to" || k === "from" ? scrubUrl(v) : scrubText(v);
      }
    }
  }
  delete event.extra;
  return event;
}

/** Options shared by the three setups. `sendDefaultPii` stays false, so no IP address or cookie is collected by the SDK in the first place. */
export function sentryOptions(env: Record<string, string | undefined>, side: "server" | "browser") {
  const dsn = sentryDsn(env, side);
  if (!dsn) return null;
  return {
    dsn,
    environment: sentryEnvironment(env),
    release: sentryRelease(env),
    sendDefaultPii: false,
    tracesSampleRate: sentryTracesSampleRate(env),
    beforeSend: <E extends AnyEvent>(event: E) => scrubEvent(event),
  };
}
