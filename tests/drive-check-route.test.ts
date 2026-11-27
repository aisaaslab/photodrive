import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { driveCheckView } from "@/lib/drive/check-message";
import { translations } from "./helpers-dictionaries";

const requireUser = vi.fn();
vi.mock("@/lib/server/auth", () => ({ requireUser }));
const limit = vi.fn();
vi.mock("@/lib/server/rate-limit", () => ({
  getRateLimiter: () => ({ limit }), clientIp: () => "1.2.3.4", rateLimitHeaders: () => ({ "Retry-After": "5" }),
}));
const { POST } = await import("@/app/api/drive/check/route");

const call = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/drive/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const URL_OK = "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  requireUser.mockReset().mockResolvedValue({ ok: true, user: { uid: "u1" } });
  limit.mockReset().mockResolvedValue({ allowed: true, limit: 30, remaining: 29, retryAfterSec: 0 });
  vi.stubEnv("GOOGLE_DRIVE_API_KEY", "KEY");
});

describe("POST /api/drive/check", () => {
  it("needs a signed-in user", async () => {
    const denied = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    requireUser.mockResolvedValue({ ok: false, response: denied });
    expect((await call({ driveUrl: URL_OK })).status).toBe(401);
  });

  it("is rate limited per user", async () => {
    limit.mockResolvedValue({ allowed: false, limit: 30, remaining: 0, retryAfterSec: 5 });
    const res = await call({ driveUrl: URL_OK });
    expect(res.status).toBe(429);
    expect(limit.mock.calls[0][0]).toMatchObject({ name: "drive-check", limit: 30, windowSec: 60 });
    expect(limit.mock.calls[0][0].id).toContain("u1");
  });

  it("rejects a malformed body, and says 'invalid' for a link that is not a Drive folder", async () => {
    expect((await call({})).status).toBe(400);
    expect((await call({ driveUrl: 5 })).status).toBe(400);
    expect(await (await call({ driveUrl: "https://example.com/x" })).json()).toEqual({ status: "invalid" });
  });

  it("is 'unavailable', not an error, when the server has no Drive key", async () => {
    vi.stubEnv("GOOGLE_DRIVE_API_KEY", "");
    expect(await (await call({ driveUrl: URL_OK })).json()).toEqual({ status: "unavailable" });
  });

  it("returns the check's answer, uncached", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
    const res = await call({ driveUrl: URL_OK });
    expect(await res.json()).toEqual({ status: "notFound" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("driveCheckView", () => {
  it("maps each answer to a tone and message, and every message exists in all six languages", () => {
    expect(driveCheckView({ status: "ok", name: "n", photos: 3, videos: 2, subfolders: 0, capped: false, inSubfolders: false })).toEqual({ tone: "good", key: "driveOk", count: 5 });
    expect(driveCheckView({ status: "ok", name: "n", photos: 0, videos: 0, subfolders: 2, capped: false, inSubfolders: true })?.key).toBe("driveOkSub");
    expect(driveCheckView({ status: "empty", name: "n" })).toMatchObject({ tone: "warn", key: "driveEmpty" });
    expect(driveCheckView({ status: "notFound" })).toMatchObject({ tone: "warn", key: "driveNotFound" });
    expect(driveCheckView({ status: "unavailable" })?.tone).toBe("muted");
    expect(driveCheckView({ status: "invalid" })).toBeNull();
    for (const t of Object.values(translations)) {
      for (const k of ["driveChecking", "driveOk", "driveOkSub", "driveEmpty", "driveUnsupported", "driveNotFound", "driveNotFolder", "driveUnavailable"] as const) {
        expect(t.newGalleryForm[k].length).toBeGreaterThan(5);
      }
      expect(t.newGalleryForm.driveOk).toContain("{n}");
    }
  });
});
