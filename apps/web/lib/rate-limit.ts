/**
 * Rate limiting with Redis (Upstash) backend for production,
 * falling back to in-memory for local development.
 *
 * Fixed-window algorithm. Set REDIS_URL + REDIS_TOKEN to enable
 * distributed limiting across multiple instances.
 *
 * Redis atomicity: SET NX EX sets both value and TTL in one call,
 * so there is no race window between INCR and EXPIRE.
 */

// ── Named profiles ──────────────────────────────────────────────
export const RATE_LIMITS = {
  /** General authenticated reads (GET with vault membership) */
  default: { limit: 30, windowMs: 60_000 },
  /** Writes (POST/PATCH/DELETE) */
  write: { limit: 10, windowMs: 60_000 },
  /** Challenge issuance — per invoiceId */
  challenge: { limit: 20, windowMs: 60_000 },
  /** Sensitive-data reads (claim-data, signed UTXO access) */
  signature: { limit: 60, windowMs: 60_000 },
} as const;

export type RateLimitProfile = keyof typeof RATE_LIMITS;

// ── In-memory fallback ──────────────────────────────────────────
const map = new Map<string, { count: number; reset: number }>();

function checkRateLimitMemory(bucket: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = map.get(bucket);

  if (!existing || now > existing.reset) {
    map.set(bucket, { count: 1, reset: now + windowMs });
    return true;
  }

  if (existing.count >= limit) return false;

  existing.count++;
  return true;
}

// ── Redis backend ───────────────────────────────────────────────
let redisClient: {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: { ex?: number; nx?: boolean }) => Promise<string | null>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
} | null = null;

async function getRedisClient() {
  if (redisClient !== null) return redisClient;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    redisClient = null;
    return null;
  }

  try {
    const moduleName = "@upstash/redis";
    const { Redis } = await import(moduleName);
    redisClient = new Redis({ url: redisUrl, token: process.env.REDIS_TOKEN ?? "" });
    return redisClient;
  } catch {
    // @upstash/redis not installed — use Upstash REST API directly
    redisClient = {
      async get(key: string) {
        const res = await fetch(`${redisUrl}/get/${encodeURIComponent(key)}`, {
          headers: { Authorization: `Bearer ${process.env.REDIS_TOKEN ?? ""}` },
        });
        const data = (await res.json()) as { result: string | null };
        return data.result;
      },
      async set(key: string, value: string, opts?: { ex?: number; nx?: boolean }) {
        const parts: string[] = [redisUrl, "set", encodeURIComponent(key), encodeURIComponent(value)];
        const query: string[] = [];
        if (opts?.ex) query.push(`EX=${opts.ex}`);
        if (opts?.nx) query.push("NX");
        const url = parts.join("/") + (query.length ? `?${query.join("&")}` : "");
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${process.env.REDIS_TOKEN ?? ""}` },
        });
        const data = (await res.json()) as { result: string | null };
        return data.result;
      },
      async incr(key: string) {
        const res = await fetch(`${redisUrl}/incr/${encodeURIComponent(key)}`, {
          headers: { Authorization: `Bearer ${process.env.REDIS_TOKEN ?? ""}` },
        });
        const data = (await res.json()) as { result: number };
        return data.result;
      },
      async expire(key: string, seconds: number) {
        const res = await fetch(`${redisUrl}/expire/${encodeURIComponent(key)}/${seconds}`, {
          headers: { Authorization: `Bearer ${process.env.REDIS_TOKEN ?? ""}` },
        });
        const data = (await res.json()) as { result: number };
        return data.result;
      },
    };
    return redisClient;
  }
}

async function checkRateLimitRedis(bucket: string, limit: number, windowSecs: number): Promise<boolean> {
  const redis = await getRedisClient();
  if (!redis) return checkRateLimitMemory(bucket, limit, windowSecs * 1000);

  const key = `rl:${bucket}`;
  // Atomic first-hit: SET NX EX sets value+TTL together — no race window with EXPIRE
  const setResult = await redis.set(key, "1", { ex: windowSecs, nx: true });
  if (setResult === "OK" || (setResult as unknown) === 1) return true;

  const current = await redis.incr(key);
  return current <= limit;
}

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Build a composite rate-limit bucket.
 *
 * @param ip  - Client IP (x-forwarded-for or x-real-ip)
 * @param scope - Short route identifier (e.g. "proposals", "stealth-write")
 * @param pubkey - Authenticated wallet pubkey (omit for unauthenticated routes)
 */
export function rateLimitBucket(ip: string, scope: string, pubkey?: string): string {
  return pubkey ? `${ip}:${pubkey}:${scope}` : `${ip}:${scope}`;
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Synchronous in-memory rate limit check.
 * Does NOT use Redis. Only suitable for single-instance or tests.
 */
export function checkRateLimit(bucket: string, limit = 10, windowMs = 60_000): boolean {
  return checkRateLimitMemory(bucket, limit, windowMs);
}

/**
 * Async rate limit check — uses Redis when REDIS_URL is set.
 *
 * @param bucket  - Unique bucket string (use rateLimitBucket() to build)
 * @param profileOrLimit - Named profile or numeric limit (default: "write")
 * @param windowMs - Window in ms when using a numeric limit (default: 60_000)
 */
export async function checkRateLimitAsync(
  bucket: string,
  profileOrLimit: RateLimitProfile | number = "default",
  windowMs = 60_000,
): Promise<boolean> {
  let limit: number;
  let window: number;

  if (typeof profileOrLimit === "string") {
    const profile = RATE_LIMITS[profileOrLimit];
    limit = profile.limit;
    window = profile.windowMs;
  } else {
    limit = profileOrLimit;
    window = windowMs;
  }

  if (process.env.NODE_ENV === "production" && !process.env.REDIS_URL) {
    // Warn once per process that in-memory rate limiting is active in prod
    if (!(globalThis as Record<string, unknown>).__rlWarnedOnce) {
      (globalThis as Record<string, unknown>).__rlWarnedOnce = true;
      console.warn("[rate-limit] REDIS_URL not set in production — using in-memory fallback (not suitable for multi-instance)");
    }
  }

  if (!process.env.REDIS_URL) {
    return checkRateLimitMemory(bucket, limit, window);
  }
  return checkRateLimitRedis(bucket, limit, Math.ceil(window / 1000));
}
