import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryStore, UpstashStore, clientIp, createRateLimiter, getRateLimiter, hashId, rateLimitHeaders,
  type RateLimitStore,
} from "@/lib/server/rate-limit";
import { createLogger } from "@/lib/server/log";

const quiet = createLogger({ scope: "test" });
beforeEach(() => {
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

describe("limit()", () => {
  it("allows up to the limit, then denies with a retry time, and counts what is left", async () => {
    const c = clock();
    const rl = createRateLimiter(new MemoryStore(c.now), quiet);
    const call = () => rl.limit({ name: "contact", id: "1.2.3.4", limit: 3, windowSec: 60 });
    expect(await call()).toMatchObject({ allowed: true, remaining: 2, retryAfterSec: 0 });
    expect(await call()).toMatchObject({ allowed: true, remaining: 1 });
    expect(await call()).toMatchObject({ allowed: true, remaining: 0 });
    c.advance(20_000);
    expect(await call()).toMatchObject({ allowed: false, remaining: 0, retryAfterSec: 40 });
  });

  it("starts the window at the first call and opens a new one after it ends", async () => {
    const c = clock();
    const rl = createRateLimiter(new MemoryStore(c.now), quiet);
    const call = () => rl.limit({ name: "x", id: "a", limit: 1, windowSec: 10 });
    expect((await call()).allowed).toBe(true);
    expect((await call()).allowed).toBe(false);
    c.advance(10_001);
    expect((await call()).allowed).toBe(true);
  });

  it("keeps different names and different callers apart", async () => {
    const rl = createRateLimiter(new MemoryStore(), quiet);
    expect((await rl.limit({ name: "a", id: "1", limit: 1, windowSec: 60 })).allowed).toBe(true);
    expect((await rl.limit({ name: "a", id: "1", limit: 1, windowSec: 60 })).allowed).toBe(false);
    expect((await rl.limit({ name: "b", id: "1", limit: 1, windowSec: 60 })).allowed).toBe(true);
    expect((await rl.limit({ name: "a", id: "2", limit: 1, windowSec: 60 })).allowed).toBe(true);
  });
});

describe("lockout", () => {
  const opts = { name: "gallery-pw", id: "9.9.9.9|gal1" };

  it("locks after 5 failures in 10 minutes for 15 minutes, then lets the caller try again", async () => {
    const c = clock();
    const rl = createRateLimiter(new MemoryStore(c.now), quiet);
    expect((await rl.isLocked(opts)).locked).toBe(false);
    for (let i = 1; i <= 4; i++) {
      expect(await rl.recordFailure(opts)).toEqual({ locked: false, remainingAttempts: 5 - i, retryAfterSec: 0 });
    }
    expect(await rl.recordFailure(opts)).toEqual({ locked: true, remainingAttempts: 0, retryAfterSec: 900 });
    c.advance(60_000);
    expect(await rl.isLocked(opts)).toEqual({ locked: true, retryAfterSec: 840 });
    c.advance(840_001);
    expect((await rl.isLocked(opts)).locked).toBe(false);
    // a fresh count starts: one failure does not lock again
    expect((await rl.recordFailure(opts)).locked).toBe(false);
  });

  it("failures spread over more than the window do not lock", async () => {
    const c = clock();
    const rl = createRateLimiter(new MemoryStore(c.now), quiet);
    for (let i = 0; i < 8; i++) {
      expect((await rl.recordFailure(opts)).locked).toBe(false);
      c.advance(3 * 60_000 + 1); // each failure lands in a new 10-minute window every ~3 attempts
      if (i % 3 === 2) c.advance(10 * 60_000);
    }
    expect((await rl.isLocked(opts)).locked).toBe(false);
  });

  it("a correct secret resets the counter but never lifts an active lock", async () => {
    const rl = createRateLimiter(new MemoryStore(), quiet);
    for (let i = 0; i < 4; i++) await rl.recordFailure(opts);
    await rl.reset(opts);
    expect((await rl.recordFailure(opts)).remainingAttempts).toBe(4); // counter restarted
    for (let i = 0; i < 4; i++) await rl.recordFailure(opts);
    expect((await rl.isLocked(opts)).locked).toBe(true);
    await rl.reset(opts);
    expect((await rl.isLocked(opts)).locked).toBe(true);
  });

  it("is per caller and gallery: another visitor or gallery is not locked", async () => {
    const rl = createRateLimiter(new MemoryStore(), quiet);
    for (let i = 0; i < 5; i++) await rl.recordFailure(opts);
    expect((await rl.isLocked({ name: "gallery-pw", id: "8.8.8.8|gal1" })).locked).toBe(false);
    expect((await rl.isLocked({ name: "gallery-pw", id: "9.9.9.9|gal2" })).locked).toBe(false);
  });
});

describe("identifiers", () => {
  it("stored keys never contain the raw IP", async () => {
    const keys: string[] = [];
    const spy: RateLimitStore = {
      incr: async (k) => (keys.push(k), { count: k.startsWith("fail:") ? 5 : 1, ttlMs: 1000 }), // 5 failures: reaches set + del
      ttl: async (k) => (keys.push(k), null),
      set: async (k) => void keys.push(k),
      del: async (k) => void keys.push(k),
    };
    const rl = createRateLimiter(spy, quiet);
    await rl.limit({ name: "contact", id: "203.0.113.7", limit: 1, windowSec: 1 });
    await rl.isLocked({ name: "pw", id: "203.0.113.7|gal" });
    await rl.recordFailure({ name: "pw", id: "203.0.113.7|gal" });
    expect(keys.length).toBe(5); // limit, isLocked, failure count, lock set, failure count cleared
    for (const k of keys) expect(k).not.toContain("203.0.113.7");
  });

  it("hashId is stable, distinct per value, and depends on RATE_LIMIT_SALT", () => {
    expect(hashId("1.1.1.1")).toBe(hashId("1.1.1.1"));
    expect(hashId("1.1.1.1")).not.toBe(hashId("1.1.1.2"));
    expect(hashId("1.1.1.1")).toHaveLength(32);
    const before = hashId("1.1.1.1");
    vi.stubEnv("RATE_LIMIT_SALT", "another-salt");
    expect(hashId("1.1.1.1")).not.toBe(before);
  });

  it("clientIp prefers the platform headers a client cannot forge", () => {
    const req = (h: Record<string, string>) => new Request("http://x", { headers: h });
    expect(clientIp(req({ "x-vercel-forwarded-for": "5.5.5.5", "x-real-ip": "6.6.6.6", "x-forwarded-for": "7.7.7.7" }))).toBe("5.5.5.5");
    expect(clientIp(req({ "x-real-ip": "6.6.6.6", "x-forwarded-for": "7.7.7.7" }))).toBe("6.6.6.6");
    expect(clientIp(req({ "x-forwarded-for": "7.7.7.7, 8.8.8.8" }))).toBe("7.7.7.7");
    expect(clientIp(req({}))).toBe("unknown");
  });

  it("builds standard 429 headers", () => {
    expect(rateLimitHeaders({ limit: 3, remaining: 0, retryAfterSec: 42 })).toEqual({
      "RateLimit-Limit": "3", "RateLimit-Remaining": "0", "Retry-After": "42",
    });
    expect(rateLimitHeaders({ limit: 3, remaining: 2, retryAfterSec: 0 })).not.toHaveProperty("Retry-After");
  });
});

describe("store failures", () => {
  const broken: RateLimitStore = {
    incr: async () => { throw new Error("redis down"); },
    ttl: async () => { throw new Error("redis down"); },
    set: async () => { throw new Error("redis down"); },
    del: async () => { throw new Error("redis down"); },
  };

  it("fails open by default and logs the error", async () => {
    const rl = createRateLimiter(broken, createLogger({ scope: "t" }));
    expect((await rl.limit({ name: "a", id: "b", limit: 1, windowSec: 1 })).allowed).toBe(true);
    expect((await rl.isLocked({ name: "a", id: "b" })).locked).toBe(false);
    expect((await rl.recordFailure({ name: "a", id: "b" })).locked).toBe(false);
    await expect(rl.reset({ name: "a", id: "b" })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("can fail closed where denying is safer", async () => {
    const rl = createRateLimiter(broken, quiet);
    expect((await rl.limit({ name: "a", id: "b", limit: 1, windowSec: 1, failClosed: true })).allowed).toBe(false);
    expect((await rl.isLocked({ name: "a", id: "b", failClosed: true })).locked).toBe(true);
  });
});

describe("MemoryStore", () => {
  it("stays bounded: expired entries are dropped first, then the oldest", async () => {
    const c = clock();
    const store = new MemoryStore(c.now, 5);
    for (let i = 0; i < 20; i++) await store.incr(`k${i}`, 60);
    expect(await store.ttl("k0")).toBeNull(); // evicted
    expect(await store.ttl("k19")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Upstash over HTTP against an in-process fake that speaks the same REST protocol
// ---------------------------------------------------------------------------------------------

describe("UpstashStore", () => {
  let server: Server;
  let url = "";
  let time = 5_000_000;
  const requests: { path: string; auth: string | undefined; body: unknown }[] = [];
  const data = new Map<string, { value: string; exp: number | null }>();
  let mode: "ok" | "http500" | "cmderror" | "slow" = "ok";

  const alive = (k: string) => {
    const e = data.get(k);
    if (e && e.exp !== null && e.exp <= time) data.delete(k);
    return data.get(k);
  };
  function run(cmd: (string | number)[]): unknown {
    const [name, key, ...args] = cmd.map(String);
    switch (name) {
      case "INCR": {
        const e = alive(key);
        const v = (e ? Number(e.value) : 0) + 1;
        data.set(key, { value: String(v), exp: e?.exp ?? null });
        return v;
      }
      case "EXPIRE": {
        const e = alive(key);
        if (!e) return 0;
        if (args[1] === "NX" && e.exp !== null) return 0;
        e.exp = time + Number(args[0]) * 1000;
        return 1;
      }
      case "PTTL": {
        const e = alive(key);
        return !e ? -2 : e.exp === null ? -1 : e.exp - time;
      }
      case "SET":
        data.set(key, { value: args[0], exp: args[1] === "EX" ? time + Number(args[2]) * 1000 : null });
        return "OK";
      case "DEL":
        return data.delete(key) ? 1 : 0;
      default:
        throw new Error(`unsupported ${name}`);
    }
  }

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", async () => {
        const body = JSON.parse(raw || "null");
        requests.push({ path: req.url ?? "", auth: req.headers.authorization, body });
        if (mode === "slow") await new Promise((r) => setTimeout(r, 400));
        if (mode === "http500") return void res.writeHead(500).end("boom");
        res.setHeader("content-type", "application/json");
        if (mode === "cmderror") return void res.end(JSON.stringify([{ error: "ERR wrong number of arguments" }]));
        res.end(JSON.stringify((body as (string | number)[][]).map((c) => ({ result: run(c) }))));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => void server.close());
  beforeEach(() => {
    data.clear();
    requests.length = 0;
    mode = "ok";
    time = 5_000_000;
  });

  const instance = (timeoutMs = 1500) => createRateLimiter(new UpstashStore({ url, token: "tok-123", timeoutMs }), quiet);

  it("sends one atomic multi-exec request per call, authenticated, with hashed keys", async () => {
    await instance().limit({ name: "contact", id: "203.0.113.7", limit: 3, windowSec: 60 });
    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe("/multi-exec");
    expect(requests[0].auth).toBe("Bearer tok-123");
    const cmds = requests[0].body as (string | number)[][];
    expect(cmds.map((c) => c[0])).toEqual(["INCR", "EXPIRE", "PTTL"]);
    expect(cmds[1].slice(2)).toEqual([60, "NX"]);
    expect(String(cmds[0][1])).toMatch(/^rl:contact:[0-9a-f]{32}$/);
  });

  it("limits hold across two separate instances sharing the store", async () => {
    const a = instance();
    const b = instance();
    const call = (rl: typeof a) => rl.limit({ name: "contact", id: "203.0.113.7", limit: 3, windowSec: 60 });
    expect((await call(a)).allowed).toBe(true);
    expect((await call(b)).allowed).toBe(true);
    expect((await call(a)).allowed).toBe(true);
    expect(await call(b)).toMatchObject({ allowed: false, retryAfterSec: 60 }); // 4th call, whichever instance
    expect((await call(a)).allowed).toBe(false);
    time += 61_000;
    expect((await call(b)).allowed).toBe(true); // window passed
  });

  it("a lockout set by one instance is seen by another", async () => {
    const a = instance();
    const b = instance();
    const who = { name: "gallery-pw", id: "9.9.9.9|gal1" };
    for (let i = 0; i < 5; i++) await a.recordFailure(who);
    expect(await b.isLocked(who)).toEqual({ locked: true, retryAfterSec: 900 });
    time += 901_000;
    expect((await b.isLocked(who)).locked).toBe(false);
  });

  it("fails open on HTTP errors, command errors and timeouts, and can fail closed", async () => {
    for (const m of ["http500", "cmderror"] as const) {
      mode = m;
      expect((await instance().limit({ name: "a", id: "b", limit: 1, windowSec: 5 })).allowed).toBe(true);
      expect((await instance().limit({ name: "a", id: "b", limit: 1, windowSec: 5, failClosed: true })).allowed).toBe(false);
    }
    mode = "slow";
    expect((await instance(50).limit({ name: "a", id: "b", limit: 1, windowSec: 5 })).allowed).toBe(true);
  });

  describe("getRateLimiter() chooses the store from the environment", () => {
    it("uses Upstash when UPSTASH_REDIS_REST_URL and _TOKEN are set", async () => {
      vi.stubEnv("UPSTASH_REDIS_REST_URL", url);
      vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "env-token");
      await getRateLimiter().limit({ name: "env", id: "x", limit: 1, windowSec: 5 });
      expect(requests).toHaveLength(1);
      expect(requests[0].auth).toBe("Bearer env-token");
    });

    it("falls back to memory without them (no network) and warns once in production", async () => {
      vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
      vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
      vi.stubEnv("APP_ENV", "production");
      const rl = getRateLimiter();
      expect((await rl.limit({ name: "mem", id: "x", limit: 1, windowSec: 5 })).allowed).toBe(true);
      expect((await rl.limit({ name: "mem", id: "x", limit: 1, windowSec: 5 })).allowed).toBe(false);
      expect(requests).toHaveLength(0);
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(String((console.warn as unknown as { mock: { calls: string[][] } }).mock.calls[0][0])).toContain("per server instance");
    });
  });
});
