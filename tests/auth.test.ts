import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const verifyIdToken = vi.hoisted(() => vi.fn());
vi.mock("@/lib/firebase/admin", () => ({ getAdminAuth: () => ({ verifyIdToken }), getAdminDb: () => ({}) }));

const { isAdmin, requireAdmin, requireUser, verifyBearer } = await import("@/lib/server/auth");
const { getUidFromRequest } = await import("@/lib/firebase/admin-guard");
const { route } = await import("@/lib/server/http");

const req = (authorization?: string) => new Request("http://localhost/api/x", { headers: authorization ? { authorization } : {} });

beforeEach(() => {
  verifyIdToken.mockReset();
  vi.stubEnv("ADMIN_UID", "boss");
});
afterEach(() => vi.unstubAllEnvs());

describe("requireUser / requireAdmin (S5-04)", () => {
  it("a valid bearer token gives the verified user", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1", email: "u1@example.com" });
    const r = await requireUser(req("Bearer good-token"));
    expect(r).toEqual({ ok: true, user: { uid: "u1", email: "u1@example.com" } });
    expect(verifyIdToken).toHaveBeenCalledWith("good-token");
  });

  it("no header, the wrong scheme, an empty token or an invalid token is 401 { error: 'Unauthorized' }", async () => {
    verifyIdToken.mockRejectedValue(new Error("bad"));
    for (const header of [undefined, "", "Bearer", "Bearer ", "Basic abc", "token-without-scheme", "Bearer two tokens", "Bearer bad-token"]) {
      const r = await requireUser(req(header));
      expect(r.ok, String(header)).toBe(false);
      if (!r.ok) {
        expect(r.response.status).toBe(401);
        expect(await r.response.json()).toEqual({ error: "Unauthorized" });
      }
    }
    expect(verifyIdToken).toHaveBeenCalledTimes(1); // only the last header was a well-formed token worth verifying
  });

  it("the scheme is case-insensitive, as in HTTP", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    expect((await requireUser(req("bearer abc"))).ok).toBe(true);
  });

  it("requireAdmin: the administrator passes, another signed-in user is 403, nobody is 401", async () => {
    verifyIdToken.mockResolvedValue({ uid: "boss" });
    expect((await requireAdmin(req("Bearer t"))).ok).toBe(true);
    verifyIdToken.mockResolvedValue({ uid: "someone" });
    const forbidden = await requireAdmin(req("Bearer t"));
    expect(!forbidden.ok && forbidden.response.status).toBe(403);
    const anon = await requireAdmin(req());
    expect(!anon.ok && anon.response.status).toBe(401);
  });

  it("isAdmin needs ADMIN_UID to be set and a matching uid (never true for an empty value on both sides)", () => {
    expect(isAdmin("boss")).toBe(true);
    expect(isAdmin("other")).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin("")).toBe(false);
    vi.stubEnv("ADMIN_UID", "");
    expect(isAdmin("")).toBe(false);
    expect(isAdmin("boss")).toBe(false);
  });

  it("verifyBearer is the optional form: the user, or null, never a throw", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired"));
    expect(await verifyBearer(req("Bearer old"))).toBeNull();
    expect(await verifyBearer(req())).toBeNull();
  });

  it("the older getUidFromRequest still works and now shares the same logic", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u9" });
    expect(await getUidFromRequest(req("Bearer t") as never)).toBe("u9");
    expect(await getUidFromRequest(req() as never)).toBeNull();
  });
});

describe("route() (S5-04)", () => {
  beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("passes the handler's own response and arguments straight through", async () => {
    const handler = route("t", async (_req: Request, ctx: { params: Promise<{ id: string }> }) => NextResponse.json({ id: (await ctx.params).id }, { status: 201 }));
    const res = await handler(req(), { params: Promise.resolve({ id: "g1" }) });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "g1" });
  });

  it("an unexpected error is logged with the request id and answered as a plain 500 with no detail", async () => {
    const handler = route("t.fail", async () => {
      throw new Error("firestore exploded: secret-detail");
    });
    const res = await handler(new Request("http://localhost/x", { headers: { "x-request-id": "req-123" } }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Internal error" });
    const line = JSON.parse((console.error as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]);
    expect(line).toMatchObject({ level: "error", scope: "t.fail", requestId: "req-123", msg: "unhandled error" });
    expect(JSON.stringify(body)).not.toContain("secret-detail");
  });
});
