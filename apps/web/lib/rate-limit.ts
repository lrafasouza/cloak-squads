/**
 * Rate limiting with Redis (Upstash) backend for mainnet,
 * falling back to in-memory for devnet / local development.
 *
 * Uses a fixed-window algorithm. Set REDIS_URL environment variable
 * to enable the Redis backend. Without it, falls back to the
 * in-memory Map (not suitable for multi-instance deployments).
 */

// ── In-memory fallback ──────────────────────────────────────────
const map = new Map<string, { count: number; reset: number }>();

function checkRateLimitMemory(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = map.get(ip);

  if (!existing || now > existing.reset) {
    map.set(ip, { count: 1, reset: now + windowMs });
    return true;
  }

  if (existing.count >= limit) return false;

  existing.count++;
  return true;
}

// ── Redis backend ───────────────────────────────────────────────
let redisClient: {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: { ex?: number }) => Promise<string | null>;
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
    // Use Upstash Redis SDK if available, otherwise use fetch-based REST API
    // Hide module name from bundler to avoid build-time "Module not found" errors
    // when @upstash/redis is not installed.
    const moduleName = "@upstash/redis";
    const { Redis } = await import(moduleName);
    redisClient = new Redis({ url: redisUrl, token: process.env.REDIS_TOKEN ?? "" });
    return redisClient;
  } catch {
    // @upstash/redis not installed — use REST API directly
    redisClient = {
      async get(key: string) {
        const res = await fetch(`${redisUrl}/get/${encodeURIComponent(key)}`, {
          headers: { Authorization: `Bearer ${process.env.REDIS_TOKEN ?? ""}` },
        });
        const data = (await res.json()) as { result: string | null };
        return data.result;
      },
      async set(key: string, value: string, opts?: { ex?: number }) {
        const params = opts?.ex ? `?EX=${opts.ex}` : "";
        const res = await fetch(`${redisUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}${params}`, {
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

async function checkRateLimitRedis(ip: string, limit: number, windowSecs: number): Promise<boolean> {
  const redis = await getRedisClient();
  if (!redis) return checkRateLimitMemory(ip, limit, windowSecs * 1000);

  const key = `rl:${ip}`;
  const current = await redis.incr(key);

  if (current === 1) {
    // First request in this window — set expiry
    await redis.expire(key, windowSecs);
  }

  return current <= limit;
}

// ── Public API ──────────────────────────────────────────────────
/**
 * Check rate limit for a given IP address (in-memory only).
 * Always uses the in-memory store regardless of REDIS_URL.
 * Use checkRateLimitAsync in API route handlers for Redis-backed limiting.
 */
export function checkRateLimit(ip: string, limit = 10, windowMs = 60_000): boolean {
  return checkRateLimitMemory(ip, limit, windowMs);
}

/**
 * Async rate limit check — uses Redis when available.
 * Prefer this in API route handlers.
 */
export async function checkRateLimitAsync(ip: string, limit = 10, windowMs = 60_000): Promise<boolean> {
  if (!process.env.REDIS_URL) {
    return checkRateLimitMemory(ip, limit, windowMs);
  }
  return checkRateLimitRedis(ip, limit, Math.ceil(windowMs / 1000));
}
