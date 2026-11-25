import { createHash } from "node:crypto";
import { appEnv } from "@/lib/server/billing/flags";
import { createLogger, type Logger } from "@/lib/server/log";

/**
 * Shared rate limiting and lockout (S3-01, SEC-2).
 *
 * Serverless instances do not share memory, so a per-instance `Map` limits nothing in production. The
 * counters therefore live in Upstash Redis (decision D6), used through its REST API (no extra package):
 * set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. Without them an in-memory store is used,
 * which is fine for local development and tests but is per instance (a warning is logged in production).
 *
 * Keys never contain a raw IP address: the caller's identifier is hashed first.
 * If the store is unreachable the limiter fails OPEN (the request is allowed and an error is logged),
 * because a Redis outage must not take the site down; pass `failClosed: true` where that is wrong.
 */

export interface RateLimitStore {
  /** Add one to a counter that expires `windowSec` after its first increment. */
  incr(key: string, windowSec: number): Promise<{ count: number; ttlMs: number }>;
  /** Milliseconds until the key expires, or null if it does not exist. */
  ttl(key: string): Promise<number | null>;
  set(key: string, ttlSec: number): Promise<void>;
  del(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------------------------

export class MemoryStore implements RateLimitStore {
  private entries = new Map<string, { count: number; expiresAt: number }>();
  constructor(private now: () => number = Date.now, private maxEntries = 10_000) {}

  private live(key: string) {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return e;
  }

  private evict() {
    if (this.entries.size < this.maxEntries) return;
    const t = this.now();
    for (const [k, e] of this.entries) if (e.expiresAt <= t) this.entries.delete(k);
    // Still full: drop the oldest insertions so memory stays bounded.
    for (const k of this.entries.keys()) {
      if (this.entries.size < this.maxEntries) break;
      this.entries.delete(k);
    }
  }

  async incr(key: string, windowSec: number) {
    const e = this.live(key);
    if (e) {
      e.count++;
      return { count: e.count, ttlMs: e.expiresAt - this.now() };
    }
    this.evict();
    const entry = { count: 1, expiresAt: this.now() + windowSec * 1000 };
    this.entries.set(key, entry);
    return { count: 1, ttlMs: windowSec * 1000 };
  }

  async ttl(key: string) {
    const e = this.live(key);
    return e ? e.expiresAt - this.now() : null;
  }

  async set(key: string, ttlSec: number) {
    this.evict();
    this.entries.set(key, { count: 1, expiresAt: this.now() + ttlSec * 1000 });
  }

  async del(key: string) {
    this.entries.delete(key);
  }
}

/** Upstash Redis over its REST API. Commands in one call run atomically (`/multi-exec`). */
export class UpstashStore implements RateLimitStore {
  constructor(
    private opts: { url: string; token: string; timeoutMs?: number; fetchImpl?: typeof fetch },
  ) {}

  private async exec(commands: (string | number)[][]): Promise<unknown[]> {
    const doFetch = this.opts.fetchImpl ?? fetch;
    const res = await doFetch(`${this.opts.url.replace(/\/+$/, "")}/multi-exec`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.opts.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 1500),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Upstash responded ${res.status}`);
    const items = (await res.json()) as { result?: unknown; error?: string }[];
    return items.map((i) => {
      if (i.error) throw new Error(`Upstash command failed: ${i.error}`);
      return i.result;
    });
  }

  async incr(key: string, windowSec: number) {
    const r = await this.exec([["INCR", key], ["EXPIRE", key, windowSec, "NX"], ["PTTL", key]]);
    return { count: Number(r[0]), ttlMs: Math.max(0, Number(r[2])) };
  }

  async ttl(key: string) {
    const ms = Number((await this.exec([["PTTL", key]]))[0]);
    return ms >= 0 ? ms : null; // -2: no such key
  }

  async set(key: string, ttlSec: number) {
    await this.exec([["SET", key, "1", "EX", ttlSec]]);
  }

  async del(key: string) {
    await this.exec([["DEL", key]]);
  }
}

// ---------------------------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------------------------

/** Stable, non-reversible key part for an IP or other identifier (never store the raw value). */
export function hashId(value: string): string {
  return createHash("sha256").update(`${process.env.RATE_LIMIT_SALT ?? "photodrive"}:${value}`).digest("hex").slice(0, 32);
}

/**
 * The caller's IP. `x-vercel-forwarded-for` and `x-real-ip` are set by the platform edge and cannot be forged
 * by the client; the first `x-forwarded-for` entry is only a fallback for local development, where nothing
 * sits in front of the app. Returns "unknown" when nothing is available.
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-vercel-forwarded-for")?.split(",")[0].trim() ||
    h.get("x-real-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

// ---------------------------------------------------------------------------------------------
// Limiter
// ---------------------------------------------------------------------------------------------

export type LimitResult = { allowed: boolean; limit: number; remaining: number; retryAfterSec: number };
export type LockoutState = { locked: boolean; remainingAttempts: number; retryAfterSec: number };

type Common = { failClosed?: boolean };

export function createRateLimiter(store: RateLimitStore, log: Logger = createLogger({ scope: "rate-limit" })) {
  const k = (prefix: string, name: string, id: string) => `${prefix}:${name}:${hashId(id)}`;
  const sec = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

  return {
    /**
     * Fixed window: at most `limit` calls per `windowSec` for this (name, id). The window starts at the
     * first call. Over the limit: `allowed: false` and `retryAfterSec` until it resets.
     */
    async limit({ name, id, limit, windowSec, failClosed = false }: { name: string; id: string; limit: number; windowSec: number } & Common): Promise<LimitResult> {
      try {
        const { count, ttlMs } = await store.incr(k("rl", name, id), windowSec);
        const allowed = count <= limit;
        return { allowed, limit, remaining: Math.max(0, limit - count), retryAfterSec: allowed ? 0 : sec(ttlMs) };
      } catch (err) {
        log.error("rate limit store unavailable", { name, failClosed, err });
        return failClosed
          ? { allowed: false, limit, remaining: 0, retryAfterSec: 30 }
          : { allowed: true, limit, remaining: limit, retryAfterSec: 0 };
      }
    },

    /** Lockout, step 1: is this (name, id) currently locked out? Call before checking the secret. */
    async isLocked({ name, id, failClosed = false }: { name: string; id: string } & Common): Promise<{ locked: boolean; retryAfterSec: number }> {
      try {
        const ttl = await store.ttl(k("lock", name, id));
        return ttl === null ? { locked: false, retryAfterSec: 0 } : { locked: true, retryAfterSec: sec(ttl) };
      } catch (err) {
        log.error("lockout store unavailable", { name, failClosed, err });
        return failClosed ? { locked: true, retryAfterSec: 30 } : { locked: false, retryAfterSec: 0 };
      }
    },

    /**
     * Lockout, step 2: record a failed attempt. `maxFailures` failures within `windowSec` lock this
     * (name, id) for `lockSec`. Returns the state after this failure.
     */
    async recordFailure({
      name, id, maxFailures = 5, windowSec = 600, lockSec = 900,
    }: { name: string; id: string; maxFailures?: number; windowSec?: number; lockSec?: number }): Promise<LockoutState> {
      try {
        const { count } = await store.incr(k("fail", name, id), windowSec);
        if (count >= maxFailures) {
          await store.set(k("lock", name, id), lockSec);
          await store.del(k("fail", name, id));
          return { locked: true, remainingAttempts: 0, retryAfterSec: lockSec };
        }
        return { locked: false, remainingAttempts: maxFailures - count, retryAfterSec: 0 };
      } catch (err) {
        log.error("lockout store unavailable while recording a failure", { name, err });
        return { locked: false, remainingAttempts: maxFailures, retryAfterSec: 0 };
      }
    },

    /** Lockout, step 3: a correct secret clears the failure counter. */
    async reset({ name, id }: { name: string; id: string }): Promise<void> {
      try {
        await store.del(k("fail", name, id));
      } catch (err) {
        log.error("lockout store unavailable while resetting", { name, err });
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Default limiter for the app (chosen from the environment)
// ---------------------------------------------------------------------------------------------

let cached: { sig: string; limiter: ReturnType<typeof createRateLimiter> } | null = null;
let warned = false;

export function getRateLimiter() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const sig = `${url ?? ""}|${token ?? ""}`;
  if (cached?.sig === sig) return cached.limiter;

  const log = createLogger({ scope: "rate-limit" });
  let store: RateLimitStore;
  if (url && token) {
    store = new UpstashStore({ url, token });
  } else {
    if (appEnv() === "production" && !warned) {
      warned = true;
      log.warn("UPSTASH_REDIS_REST_URL/TOKEN not set: rate limits are per server instance and weak on serverless");
    }
    store = new MemoryStore();
  }
  cached = { sig, limiter: createRateLimiter(store, log) };
  return cached.limiter;
}

/** Standard headers for a 429 response. */
export function rateLimitHeaders(r: Pick<LimitResult, "limit" | "remaining" | "retryAfterSec">): Record<string, string> {
  return {
    "RateLimit-Limit": String(r.limit),
    "RateLimit-Remaining": String(r.remaining),
    ...(r.retryAfterSec > 0 ? { "Retry-After": String(r.retryAfterSec) } : {}),
  };
}
