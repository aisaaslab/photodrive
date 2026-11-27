/** S0-06: the staging-only route that raises a deliberate error. Administrators only, off unless SENTRY_TEST_ROUTE=1, never in production. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth } from "../helpers/db";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
const captured: unknown[] = [];
vi.mock("@sentry/nextjs", () => ({ getClient: () => ({}), withScope: (fn: (s: { setTag: () => void }) => void) => fn({ setTag: () => {} }), captureException: (e: unknown) => captured.push(e) }));

const { GET } = await import("@/app/api/admin/sentry-test/route");
const call = () => GET(new NextRequest("http://localhost/api/admin/sentry-test", { headers: { authorization: "Bearer t" } }));

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  captured.length = 0;
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  vi.stubEnv("ADMIN_UID", "boss");
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async () => ({ uid: "boss" })) as never);
});

describe("GET /api/admin/sentry-test", () => {
  it("answers 404 unless SENTRY_TEST_ROUTE=1, and reports nothing", async () => {
    expect((await call()).status).toBe(404);
    expect(captured).toEqual([]);
  });

  it("answers 404 in production even with the flag on", async () => {
    vi.stubEnv("SENTRY_TEST_ROUTE", "1");
    vi.stubEnv("APP_ENV", "production");
    expect((await call()).status).toBe(404);
    expect(captured).toEqual([]);
  });

  it("with the flag on (not production) raises the deliberate error: a 500 answer, and the error is reported", async () => {
    vi.stubEnv("SENTRY_TEST_ROUTE", "1");
    vi.stubEnv("APP_ENV", "staging");
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" }); // the visitor never sees the message
    expect(captured).toHaveLength(1);
    expect((captured[0] as Error).message).toMatch(/Sentry test error/);
  });

  it("a customer is refused before anything else (403), even with the flag on", async () => {
    vi.stubEnv("SENTRY_TEST_ROUTE", "1");
    vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async () => ({ uid: "someone" })) as never);
    expect((await call()).status).toBe(403);
    expect(captured).toEqual([]);
  });
});
