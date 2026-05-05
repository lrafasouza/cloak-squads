/**
 * Stateless HMAC-signed challenge for stealth invoice claim-data endpoint.
 *
 * Flow:
 * 1. Client requests a challenge: POST /api/stealth/[id]/challenge
 * 2. Server creates { invoiceId, nonce, expiresAt }, signs with HMAC-SHA256,
 *    and returns { challengeId (the token), challenge (random nonce) }
 * 3. Client signs the nonce bytes with their Ed25519 key derived from the box seed
 * 4. Client sends challengeId + derivedPubkey + signature to claim-data endpoint
 * 5. Server verifies: HMAC token is valid + not expired, derivedPubkey matches
 *    stealthPubkey, and Ed25519 signature over the nonce is valid
 *
 * One-time enforcement: consumeChallenge marks the challengeId as used in Redis
 * (TTL = 2 × CHALLENGE_TTL_MS). Without Redis, consume is a no-op — acceptable
 * degradation for dev/test environments; the TTL window limits replay risk.
 */

import { createHash, createHmac, timingSafeEqual } from "crypto";

const CHALLENGE_TTL_MS = 60_000;
const CONSUME_TTL_SECS = 120; // 2× TTL — covers full challenge validity window

function getSecret(): string {
  const s = process.env.JWT_SIGNING_SECRET;
  if (!s) throw new Error("JWT_SIGNING_SECRET is not set");
  return s;
}

function base64urlEncode(bytes: Uint8Array): string {
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/** Stable hash of a challengeId for use as a Redis key. */
function challengeHash(challengeId: string): string {
  return createHash("sha256").update(challengeId).digest("hex").slice(0, 40);
}

// ── Redis one-time consume ──────────────────────────────────────

type SimpleRedis = {
  set: (key: string, value: string, opts?: { ex?: number; nx?: boolean }) => Promise<string | null>;
};

let _redis: SimpleRedis | null | undefined = undefined; // undefined = not yet resolved

async function getRedis(): Promise<SimpleRedis | null> {
  if (_redis !== undefined) return _redis;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    _redis = null;
    return null;
  }

  try {
    const moduleName = "@upstash/redis";
    const { Redis } = await import(moduleName);
    _redis = new Redis({ url: redisUrl, token: process.env.REDIS_TOKEN ?? "" }) as SimpleRedis;
    return _redis;
  } catch {
    // Fallback: REST API
    _redis = {
      async set(key: string, _value: string, opts?: { ex?: number; nx?: boolean }) {
        const parts = [redisUrl, "set", encodeURIComponent(key), "1"];
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
    };
    return _redis;
  }
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Generate a signed challenge token for a given invoice ID.
 * Returns { challengeId (signed token), challenge (base64url nonce) }.
 */
export function createChallenge(invoiceId: string): {
  challengeId: string;
  challenge: string;
} {
  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(nonceBytes);
  const nonce = base64urlEncode(nonceBytes);
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;

  const payload = `${invoiceId}|${nonce}|${expiresAt}`;
  const sig = signPayload(payload);
  const challengeId = `${Buffer.from(payload).toString("base64url")}.${sig}`;

  return { challengeId, challenge: nonce };
}

/**
 * Verify and decode a challenge token.
 * Returns the nonce bytes if valid, null if expired or tampered.
 */
export function checkChallenge(invoiceId: string, challengeId: string): Uint8Array | null {
  try {
    const dotIdx = challengeId.lastIndexOf(".");
    if (dotIdx === -1) return null;

    const encodedPayload = challengeId.slice(0, dotIdx);
    const receivedSig = challengeId.slice(dotIdx + 1);

    const payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const expectedSig = signPayload(payload);

    if (!timingSafeEqual(Buffer.from(receivedSig), Buffer.from(expectedSig))) return null;

    const parts = payload.split("|");
    if (parts.length !== 3) return null;
    const tokenInvoiceId = parts[0]!;
    const nonce = parts[1]!;
    const expiresAtStr = parts[2]!;

    if (tokenInvoiceId !== invoiceId) return null;

    const expiresAt = Number(expiresAtStr);
    if (Number.isNaN(expiresAt) || Date.now() > expiresAt) return null;

    const padding = "=".repeat((4 - (nonce.length % 4)) % 4);
    const base64 = nonce.replace(/-/g, "+").replace(/_/g, "/") + padding;
    return Uint8Array.from(Buffer.from(base64, "base64"));
  } catch {
    return null;
  }
}

/**
 * Atomically mark a challenge as consumed (one-time use).
 * Returns true if this is the first use, false if already consumed.
 *
 * Without Redis: always returns true (no-op, acceptable for dev/test).
 */
export async function consumeChallenge(invoiceId: string, challengeId: string): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return true; // no Redis — degrade gracefully

  const key = `chal-used:${invoiceId}:${challengeHash(challengeId)}`;
  const result = await redis.set(key, "1", { ex: CONSUME_TTL_SECS, nx: true });
  // SET NX returns "OK" (or 1 via some clients) on first use, null when key exists
  return result === "OK" || (result as unknown) === 1;
}
