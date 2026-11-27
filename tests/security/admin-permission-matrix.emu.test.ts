/**
 * S8-05: the permission matrix. EVERY route under app/api/admin is discovered from the file system (so a new one is covered the moment it
 * is added) and called with every method it exports as: nobody signed in (401), a signed-in customer (403), and the administrator (let
 * through: neither 401 nor 403, and never a server error). Customers and visitors must never change anything, so the database is checked
 * to be untouched after the first two passes.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testDb } from "../helpers/db";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const ROOT = join(process.cwd(), "app/api/admin");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? routeFiles(p) : n === "route.ts" ? [p] : [];
  });
}
const files = routeFiles(ROOT).sort();
/** "/api/admin/users/[uid]" → "/api/admin/users/x1"; every dynamic segment gets a value that matches nothing. */
const urlOf = (f: string) => "/" + relative(join(process.cwd(), "app"), f).split(sep).slice(0, -1).join("/").replace(/\[[^\]]+\]/g, "nothing-here");
const paramsOf = (f: string) => Object.fromEntries([...f.matchAll(/\[([^\]]+)\]/g)].map((m) => [m[1], "nothing-here"]));

const AUTH = () => process.env.FIREBASE_AUTH_EMULATOR_HOST!;
async function signUp(email: string) {
  const r = await fetch(`http://${AUTH()}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "test-password-1", returnSecureToken: true }),
  });
  const j = await r.json();
  return { uid: j.localId as string, idToken: j.idToken as string };
}

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const handlers: { file: string; url: string; method: string; fn: Handler }[] = [];
let customer: string, boss: string;

/** A handler that throws is a server error (the framework would answer 500), so it is reported as one rather than aborting the walk. */
const call = (h: (typeof handlers)[number], token?: string): Promise<{ status: number }> =>
  callRaw(h, token).catch(() => ({ status: 599 }));
const callRaw = (h: (typeof handlers)[number], token?: string) =>
  h.fn(
    new NextRequest(`http://localhost${h.url}`, {
      method: h.method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(h.method === "GET" ? {} : { body: "{}" }),
    }),
    { params: Promise.resolve(paramsOf(h.file)) },
  );

const dump = async () => {
  const cols = await testDb().listCollections();
  const out: Record<string, unknown> = {};
  for (const c of cols) for (const d of (await c.get()).docs) out[`${c.id}/${d.id}`] = d.data();
  return JSON.stringify(out);
};

beforeAll(async () => {
  for (const file of files) {
    const mod = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
    for (const m of METHODS) if (typeof mod[m] === "function") handlers.push({ file, url: urlOf(file), method: m, fn: mod[m] as Handler });
  }
});

beforeEach(async () => {
  await clearEmulators();
  vi.unstubAllEnvs();
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  customer = (await signUp("customer@example.com")).idToken;
  const b = await signUp("boss@example.com");
  boss = b.idToken;
  vi.stubEnv("ADMIN_UID", b.uid);
});

describe("admin API permission matrix", () => {
  it("discovers the routes (a guard against the walk silently finding nothing)", () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
    expect(handlers.length).toBeGreaterThanOrEqual(25);
  });

  it("every admin route file checks for an administrator", () => {
    const missing = files.filter((f) => !/requireAdmin\s*\(/.test(readFileSync(f, "utf8")));
    expect(missing.map((f) => relative(process.cwd(), f))).toEqual([]);
  });

  it("nobody signed in: 401 on every route and method, and nothing changes", async () => {
    const before = await dump();
    const bad: string[] = [];
    for (const h of handlers) { const r = await call(h); if (r.status !== 401) bad.push(`${h.method} ${h.url} → ${r.status}`); }
    expect(bad).toEqual([]);
    expect(await dump()).toBe(before);
  });

  it("a signed-in customer: 403 on every route and method, and nothing changes", async () => {
    const before = await dump();
    const bad: string[] = [];
    for (const h of handlers) { const r = await call(h, customer); if (r.status !== 403) bad.push(`${h.method} ${h.url} → ${r.status}`); }
    expect(bad).toEqual([]);
    expect(await dump()).toBe(before);
  });

  it("an invalid token is refused the same way (401)", async () => {
    const bad: string[] = [];
    for (const h of handlers) { const r = await call(h, "not-a-token"); if (r.status !== 401) bad.push(`${h.method} ${h.url} → ${r.status}`); }
    expect(bad).toEqual([]);
  });

  it("the administrator is let through every route and method (never 401 or 403, never a server error)", async () => {
    const bad: string[] = [];
    for (const h of handlers) { const r = await call(h, boss); if (r.status === 401 || r.status === 403 || r.status >= 500) bad.push(`${h.method} ${h.url} → ${r.status}`); }
    expect(bad).toEqual([]);
  });
});

describe("a missing target is a 404, never a crash", () => {
  it("editing a gallery that does not exist answers 404 and creates nothing", async () => {
    const h = handlers.find((x) => x.method === "PATCH" && x.url === "/api/admin/galleries/nothing-here")!;
    const r = await h.fn(
      new NextRequest(`http://localhost${h.url}`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${boss}` }, body: JSON.stringify({ name: "New name" }) }),
      { params: Promise.resolve({ id: "nothing-here" }) },
    );
    expect(r.status).toBe(404);
    expect((await testDb().collection("galleries").doc("nothing-here").get()).exists).toBe(false);
  });
});
