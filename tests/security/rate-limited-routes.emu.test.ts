/** S3-06: the contact form and selection submit use the shared limiter. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testDb } from "../helpers/db";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", async (orig) => ({ ...(await orig<typeof import("@/lib/email")>()), sendEmail }));

const { POST: contact } = await import("@/app/api/contact/route");
const { POST: submit } = await import("@/app/api/galleries/[id]/selection/submit/route");

let n = 0;
const freshIp = () => `198.51.100.${++n}`;
const post = (url: string, body: unknown, headers: Record<string, string>) =>
  new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const validContact = { name: "Anna", email: "anna@example.com", subject: "Hi", message: "Hello, I have a question about my gallery." };
const sendContact = (ip: string, extra: Record<string, string> = {}) =>
  contact(post("http://localhost/api/contact", validContact, { "x-real-ip": ip, ...extra }));
const sendSelection = (galleryId: string, ip: string, extra: Record<string, string> = {}) =>
  submit(post(`http://localhost/api/galleries/${galleryId}/selection/submit`, { name: "Anna" }, { "x-real-ip": ip, ...extra }), {
    params: Promise.resolve({ id: galleryId }),
  });

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  sendEmail.mockReset().mockResolvedValue(true);
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

describe("contact form", () => {
  it("allows 5 messages per visitor, then answers 429 with Retry-After, and stores only the allowed ones", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) expect((await sendContact(ip)).status, `message ${i + 1}`).toBe(200);
    const sixth = await sendContact(ip);
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(sixth.headers.get("ratelimit-remaining")).toBe("0");
    expect((await testDb().collection("contactMessages").get()).size).toBe(5);
  });

  it("is per visitor: another IP is not affected", async () => {
    const ip = freshIp();
    for (let i = 0; i < 6; i++) await sendContact(ip);
    expect((await sendContact(freshIp())).status).toBe(200);
  });

  it("cannot be dodged by forging X-Forwarded-For while the platform's real IP header is present", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) await sendContact(ip, { "x-forwarded-for": `1.2.3.${i}` });
    expect((await sendContact(ip, { "x-forwarded-for": "9.9.9.9" })).status).toBe(429);
  });

  it("still validates after the limit check (bad input is 400, and counts toward the limit)", async () => {
    const ip = freshIp();
    const bad = await contact(post("http://localhost/api/contact", { name: "A" }, { "x-real-ip": ip }));
    expect(bad.status).toBe(400);
  });
});

describe("selection submit", () => {
  it("allows 5 submissions per visitor and gallery, then 429 with Retry-After", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) expect((await sendSelection("galleryA", ip)).status, `try ${i + 1}`).not.toBe(429);
    const sixth = await sendSelection("galleryA", ip);
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual({ error: "Too many requests. Please try again in a few minutes." });
    expect(Number(sixth.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("is per gallery and per visitor", async () => {
    const ip = freshIp();
    for (let i = 0; i < 6; i++) await sendSelection("galleryA", ip);
    expect((await sendSelection("galleryB", ip)).status).not.toBe(429); // same visitor, another gallery
    expect((await sendSelection("galleryA", freshIp())).status).not.toBe(429); // another visitor, same gallery
  });

  it("cannot be dodged by forging X-Forwarded-For", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) await sendSelection("galleryC", ip, { "x-forwarded-for": `5.5.5.${i}` });
    expect((await sendSelection("galleryC", ip, { "x-forwarded-for": "8.8.8.8" })).status).toBe(429);
  });
});

describe("no per-instance limiter is left", () => {
  it("neither route keeps its own Map of hits any more", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["app/api/contact/route.ts", "app/api/galleries/[id]/selection/submit/route.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/new Map<string, number\[\]>/);
      expect(src, f).toContain("getRateLimiter");
    }
  });
});
