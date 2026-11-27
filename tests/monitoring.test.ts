import { describe, expect, it } from "vitest";
import { scrubEvent, scrubText, sentryDsn, sentryEnvironment, sentryOptions, sentryRelease, sentryTracesSampleRate } from "@/lib/shared/monitoring";

const DSN = "https://abc123@o1.ingest.sentry.io/42";

describe("monitoring settings (S0-06)", () => {
  it("is off without a valid DSN, and on with one", () => {
    expect(sentryDsn({}, "server")).toBeNull();
    expect(sentryDsn({ SENTRY_DSN: "not a dsn" }, "server")).toBeNull();
    expect(sentryOptions({}, "server")).toBeNull();
    expect(sentryDsn({ SENTRY_DSN: DSN }, "server")).toBe(DSN);
    expect(sentryDsn({ NEXT_PUBLIC_SENTRY_DSN: DSN }, "server")).toBe(DSN); // the server falls back to the public one
    expect(sentryDsn({ SENTRY_DSN: DSN }, "browser")).toBeNull(); // the browser only ever gets the public one
    expect(sentryDsn({ NEXT_PUBLIC_SENTRY_DSN: ` ${DSN} ` }, "browser")).toBe(DSN);
  });

  it("tags the environment and release so staging and production are never mixed", () => {
    expect(sentryEnvironment({ SENTRY_ENVIRONMENT: "staging", APP_ENV: "production" })).toBe("staging");
    expect(sentryEnvironment({ APP_ENV: "production", NODE_ENV: "production" })).toBe("production");
    expect(sentryEnvironment({})).toBe("development");
    expect(sentryRelease({ VERCEL_GIT_COMMIT_SHA: "abc1234" })).toBe("abc1234");
    expect(sentryRelease({ SENTRY_RELEASE: "r1", VERCEL_GIT_COMMIT_SHA: "abc1234" })).toBe("r1");
    expect(sentryRelease({})).toBeUndefined();
  });

  it("keeps the trace rate small and valid, and never collects default PII", () => {
    expect(sentryTracesSampleRate({})).toBe(0.05);
    expect(sentryTracesSampleRate({ SENTRY_TRACES_SAMPLE_RATE: "0.5" })).toBe(0.5);
    expect(sentryTracesSampleRate({ SENTRY_TRACES_SAMPLE_RATE: "7" })).toBe(0.05);
    const o = sentryOptions({ SENTRY_DSN: DSN, APP_ENV: "staging", VERCEL_GIT_COMMIT_SHA: "deadbeef" }, "server")!;
    expect(o).toMatchObject({ dsn: DSN, environment: "staging", release: "deadbeef", sendDefaultPii: false });
  });
});

describe("the privacy filter (S0-06)", () => {
  it("removes the user, IP, cookies, body, authorization and signature headers, and secret-looking query values", () => {
    const e = scrubEvent({
      user: { id: "u1", email: "jane@example.com", ip_address: "1.2.3.4" },
      server_name: "host-1",
      request: {
        url: "https://app.example.com/api/gallery/photo?token=SECRET&id=abc&session_id=cs_live_1",
        headers: { authorization: "Bearer xyz", cookie: "a=b", "stripe-signature": "t=1,v1=zz", "x-forwarded-for": "1.2.3.4", "user-agent": "UA", "content-type": "application/json" },
        cookies: { a: "b" }, data: { password: "hunter2" }, query_string: "token=SECRET",
      },
      extra: { anything: "jane@example.com" },
    });
    expect(e.user).toBeUndefined();
    expect(e.server_name).toBeUndefined();
    expect(e.extra).toBeUndefined();
    expect(e.request!.cookies).toBeUndefined();
    expect(e.request!.data).toBeUndefined();
    expect(e.request!.query_string).toBeUndefined();
    expect(Object.keys(e.request!.headers!).sort()).toEqual(["content-type", "user-agent"]);
    expect(e.request!.url).not.toContain("SECRET");
    expect(e.request!.url).not.toContain("cs_live_1");
    expect(e.request!.url).toContain("id=abc"); // harmless parameters stay
  });

  it("masks e-mail addresses in messages, exception text and breadcrumbs", () => {
    expect(scrubText("failed for jane.doe+x@example.co.uk now")).toBe("failed for [email] now");
    const e = scrubEvent({
      message: "no account for a@b.com",
      exception: { values: [{ value: "bad address x@y.org" }] },
      breadcrumbs: [{ message: "sent to c@d.io", data: { url: "/x?token=T", note: "e@f.net" } }],
    });
    expect(e.message).toBe("no account for [email]");
    expect(e.exception!.values![0].value).toBe("bad address [email]");
    expect(e.breadcrumbs![0].message).toBe("sent to [email]");
    expect(JSON.stringify(e.breadcrumbs)).not.toContain("T\"");
    expect(e.breadcrumbs![0].data!.note).toBe("[email]");
  });

  it("leaves an event without any of those fields intact", () => {
    expect(scrubEvent({ message: "plain" })).toEqual({ message: "plain" });
  });
});
