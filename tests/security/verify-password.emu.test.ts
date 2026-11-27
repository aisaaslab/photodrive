/** S3-05: gallery password verification: lockout, generic errors, body validation, Secure cookie. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testDb } from "../helpers/db";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const password = await import("@/lib/gallery/password");
const { POST } = await import("@/app/api/gallery/verify-password/route");

let n = 0;
/** Each test gets its own IP so the shared in-memory limiter never leaks state between tests. */
const freshIp = () => `198.51.100.${++n}`;

const call = (body: unknown, ip: string, raw?: string) =>
  POST(
    new NextRequest("http://localhost/api/gallery/verify-password", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: raw ?? JSON.stringify(body),
    }),
  );

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("GALLERY_JWT_SECRET", "test-secret-for-gallery-tokens-0123456789");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  await testDb().collection("galleries").doc("g1").set({
    slug: "wedding", name: "Wedding", passwordHash: await password.hashPassword("correct horse"), pwChangedAt: 0,
  });
  await testDb().collection("galleries").doc("g2").set({
    slug: "other", name: "Other", passwordHash: await password.hashPassword("other-pass"), pwChangedAt: 0,
  });
  await testDb().collection("galleries").doc("pub").set({ slug: "public-one", name: "Public" });
});

const setCookie = (res: Response) => res.headers.get("set-cookie") ?? "";

describe("a correct password", () => {
  it("unlocks the gallery with an httpOnly, SameSite=Strict cookie for that gallery", async () => {
    const res = await call({ slug: "wedding", password: "correct horse" }, freshIp());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const cookie = setCookie(res);
    expect(cookie).toContain("gallery_token_g1=");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=604800");
  });

  it("sets the Secure flag in production and not in development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(setCookie(await call({ slug: "wedding", password: "correct horse" }, freshIp()))).toMatch(/;\s*Secure/i);
    vi.stubEnv("NODE_ENV", "development");
    expect(setCookie(await call({ slug: "wedding", password: "correct horse" }, freshIp()))).not.toMatch(/;\s*Secure/i);
  });
});

describe("generic errors", () => {
  it("a wrong password, an unknown gallery and a gallery without a password answer identically", async () => {
    const wrong = await call({ slug: "wedding", password: "nope" }, freshIp());
    const unknown = await call({ slug: "does-not-exist", password: "nope" }, freshIp());
    const none = await call({ slug: "public-one", password: "nope" }, freshIp());
    for (const r of [wrong, unknown, none]) expect(r.status).toBe(401);
    const bodies = await Promise.all([wrong, unknown, none].map((r) => r.text()));
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0])).toEqual({ error: "Incorrect password" });
    for (const r of [wrong, unknown, none]) expect(setCookie(r)).toBe("");
  });

  it("does the same bcrypt work whether or not the gallery exists (no timing oracle)", async () => {
    const spy = vi.spyOn(password, "verifyPassword");
    await call({ slug: "does-not-exist", password: "x" }, freshIp());
    await call({ slug: "public-one", password: "x" }, freshIp());
    await call({ slug: "wedding", password: "x" }, freshIp());
    expect(spy).toHaveBeenCalledTimes(3);
    const hashes = spy.mock.calls.map((c) => c[1]);
    expect(hashes.every((h) => /^\$2[aby]\$\d\d\$/.test(h))).toBe(true); // a real bcrypt hash each time
  });
});

describe("lockout", () => {
  it("locks after 5 wrong passwords: the 5th answers 429 with Retry-After, and even the right password is refused", async () => {
    const ip = freshIp();
    for (let i = 1; i <= 4; i++) expect((await call({ slug: "wedding", password: `bad${i}` }, ip)).status).toBe(401);
    const fifth = await call({ slug: "wedding", password: "bad5" }, ip);
    expect(fifth.status).toBe(429);
    expect(fifth.headers.get("retry-after")).toBe("900");
    expect(await fifth.json()).toEqual({ error: "Too many attempts. Try again later." });

    const right = await call({ slug: "wedding", password: "correct horse" }, ip);
    expect(right.status).toBe(429);
    expect(setCookie(right)).toBe("");
  });

  it("is per visitor and per gallery: others are not locked", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) await call({ slug: "wedding", password: "bad" }, ip);
    expect((await call({ slug: "wedding", password: "correct horse" }, freshIp())).status).toBe(200); // another visitor
    expect((await call({ slug: "other", password: "other-pass" }, ip)).status).toBe(200); // same visitor, other gallery
  });

  it("a correct password clears the failure count", async () => {
    const ip = freshIp();
    for (let i = 0; i < 4; i++) await call({ slug: "wedding", password: "bad" }, ip);
    expect((await call({ slug: "wedding", password: "correct horse" }, ip)).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await call({ slug: "wedding", password: "bad" }, ip)).status).toBe(401);
    expect((await call({ slug: "wedding", password: "bad" }, ip)).status).toBe(429); // counting started again from zero
  });

  it("guessing at galleries that do not exist also locks that visitor and slug", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) await call({ slug: "nothing-here", password: "x" }, ip);
    expect((await call({ slug: "nothing-here", password: "x" }, ip)).status).toBe(429);
  });

  it("a visitor trying many galleries is stopped by the per-IP limit", async () => {
    const ip = freshIp();
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await call({ slug: `gallery-${i}`, password: "x" }, ip)).status;
    expect(last).toBe(429);
  });
});

describe("request validation", () => {
  it("answers 400 (never 500) to a body that is not JSON or not the right shape", async () => {
    const ip = freshIp();
    const get = vi.spyOn(testDb().collection("galleries"), "where");
    const bad: [unknown, string | undefined][] = [
      [undefined, "{not json"],
      [undefined, ""],
      [null, undefined],
      ["a string", undefined],
      [[], undefined],
      [{}, undefined],
      [{ slug: "wedding" }, undefined],
      [{ password: "x" }, undefined],
      [{ slug: 5, password: "x" }, undefined],
      [{ slug: "wedding", password: ["x"] }, undefined],
      [{ slug: "", password: "x" }, undefined],
      [{ slug: "wedding", password: "" }, undefined],
      [{ slug: "wedding", password: "x".repeat(201) }, undefined],
      [{ slug: "s".repeat(201), password: "x" }, undefined],
    ];
    for (const [body, raw] of bad) {
      const res = await call(body, ip, raw);
      expect(res.status, JSON.stringify(body) ?? raw).toBe(400);
      expect(await res.json()).toMatchObject({ error: "Invalid request" }); // the shared 400 (S3-09) may also list the field names
    }
    expect(get).not.toHaveBeenCalled(); // rejected before touching the database
  });

  it("malformed requests do not count as failed password attempts", async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) await call({ slug: "wedding" }, ip);
    expect((await call({ slug: "wedding", password: "correct horse" }, ip)).status).toBe(200);
  });

  it("accepts a password with spaces exactly as typed", async () => {
    await testDb().collection("galleries").doc("g3").set({
      slug: "spaces", name: "S", passwordHash: await password.hashPassword("  padded pass  "), pwChangedAt: 0,
    });
    expect((await call({ slug: "spaces", password: "  padded pass  " }, freshIp())).status).toBe(200);
    expect((await call({ slug: "spaces", password: "padded pass" }, freshIp())).status).toBe(401);
  });
});
