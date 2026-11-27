import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { StripeConfigError, getStripe, getWebhookSecret } from "@/lib/server/billing/stripe";
import { appEnv } from "@/lib/server/billing/flags";
import { eventFixture, sessionFixture, signedWebhookRequest, TEST_WEBHOOK_SECRET } from "../helpers/stripe";

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("getStripe / getWebhookSecret (S1-10, PAY-5)", () => {
  it("throws a clear error at request time when STRIPE_SECRET_KEY is missing or blank", () => {
    for (const v of ["", "   "]) {
      vi.stubEnv("STRIPE_SECRET_KEY", v);
      expect(() => getStripe()).toThrow(StripeConfigError);
      expect(() => getStripe()).toThrow(/STRIPE_SECRET_KEY is not set/);
    }
  });

  it("throws when STRIPE_WEBHOOK_SECRET is missing", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect(() => getWebhookSecret()).toThrow(/STRIPE_WEBHOOK_SECRET is not set/);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    expect(getWebhookSecret()).toBe("whsec_x");
  });

  it("refuses live keys outside production (APP_ENV, Vercel preview, local)", () => {
    for (const key of ["sk_live_abc", "rk_live_abc"]) {
      vi.stubEnv("STRIPE_SECRET_KEY", key);
      for (const env of ["local", "staging"]) {
        vi.stubEnv("APP_ENV", env);
        expect(() => getStripe(), `${key} in ${env}`).toThrow(/live keys are only allowed in production/);
      }
    }
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("APP_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview"); // previews run with NODE_ENV=production
    expect(() => getStripe()).toThrow(/live keys/);
  });

  it("allows a live key in production and test keys everywhere", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("APP_ENV", "production");
    expect(getStripe()).toBeTruthy();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");
    for (const env of ["local", "staging", "production"]) {
      vi.stubEnv("APP_ENV", env);
      expect(getStripe()).toBeTruthy();
    }
  });

  it("reuses the client for the same key and builds a new one when the key changes", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_one");
    const a = getStripe();
    expect(getStripe()).toBe(a);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_two");
    expect(getStripe()).not.toBe(a);
  });

  it("appEnv resolves APP_ENV first, then Vercel, then NODE_ENV", () => {
    vi.stubEnv("APP_ENV", "staging");
    expect(appEnv()).toBe("staging");
    vi.stubEnv("APP_ENV", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(appEnv()).toBe("staging");
    vi.stubEnv("VERCEL_ENV", "development");
    expect(appEnv()).toBe("local");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(appEnv()).toBe("production");
    vi.stubEnv("NODE_ENV", "test");
    expect(appEnv()).toBe("local");
  });
});

describe("routes fail loudly and safely when Stripe is misconfigured", () => {
  it("order: 500 'Payments are not configured' with no key (not a misleading 404)", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const { GET } = await import("@/app/api/stripe/order/route");
    const res = await GET(new NextRequest("http://localhost/api/stripe/order?session_id=cs_test_abcdefghij1234"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Payments are not configured" });
  });

  it("webhook: 500 when the signing secret is missing, the key is missing, or a live key is used in staging", async () => {
    const { POST } = await import("@/app/api/stripe/webhook/route");
    const send = () => POST(new NextRequest(signedWebhookRequest(eventFixture("checkout.session.completed", sessionFixture("paid")))));

    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect((await send()).status).toBe(500);

    vi.stubEnv("STRIPE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect((await send()).status).toBe(500);

    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("APP_ENV", "staging");
    const res = await send();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Webhook not configured" });
  });
});

describe("STRIPE_API_BASE_URL (a local stand-in for Stripe, tests and staging only)", () => {
  const field = (name: string) => (getStripe() as unknown as { getApiField(n: string): string }).getApiField(name);

  it("points the client at the stand-in outside production", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_standin");
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("STRIPE_API_BASE_URL", "http://127.0.0.1:12111");
    expect([field("host"), field("port"), field("protocol")]).toEqual(["127.0.0.1", "12111", "http"]);
  });

  it("is ignored in production, so a stray variable can never redirect real payment calls", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_standin");
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("STRIPE_API_BASE_URL", "http://127.0.0.1:12111");
    expect(field("host")).toBe("api.stripe.com");
  });

  it("an unusable value falls back to Stripe, and unsetting it switches back", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_standin");
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("STRIPE_API_BASE_URL", "not a url");
    expect(field("host")).toBe("api.stripe.com");
    vi.stubEnv("STRIPE_API_BASE_URL", "http://127.0.0.1:12111");
    expect(field("host")).toBe("127.0.0.1");
    vi.stubEnv("STRIPE_API_BASE_URL", "");
    expect(field("host")).toBe("api.stripe.com");
  });
});
