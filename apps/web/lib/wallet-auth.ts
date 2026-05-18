import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import nacl from "tweetnacl";
/**
 * Server-side wallet authentication for API routes.
 *
 * Three auth paths are accepted (checked in order):
 *
 * 1. Session cookie (preferred — set by `/api/auth/login`):
 *    Cookie `aegis-session` carries an HMAC-signed `{pubkey, exp}` token.
 *    Issued after a single `aegis:session:` wallet signature; valid for 30
 *    minutes. Eliminates per-request `signMessage` popups.
 *
 * 2. v2 per-request signature (endpoint-bound):
 *    Message: aegis:v2:{pubkey}:{ts}:{nonce}:{method}:{path}:{bodyHash}
 *    Headers: x-solana-pubkey, x-solana-signature, x-solana-timestamp,
 *             x-solana-nonce, x-solana-method, x-solana-path, x-solana-body-hash
 *    Used by clients that haven't (yet) upgraded to session cookies.
 *
 * 3. v1 legacy signature (DISABLED by default):
 *    Message: aegis:{pubkey}:{ts}:{nonce}
 *    NOT endpoint-bound — a captured signature replays on any route within
 *    the 5min timestamp window. Only accepted when ALLOW_LEGACY_AUTH=true,
 *    which should remain set only while migrating an old client.
 */
import { SESSION_COOKIE_NAME, verifySessionToken } from "./auth-session";
import { checkRateLimitAsync, rateLimitBucket } from "./rate-limit";

const AUTH_WINDOW_SECS = 5 * 60; // 5 minutes
// Outlive the timestamp window by a small margin so a nonce we just accepted
// at second 299 cannot be re-presented at second 301 from a different request.
const NONCE_RESERVATION_TTL_MS = (AUTH_WINDOW_SECS + 30) * 1000;

export type WalletAuthResult =
  | { ok: true; publicKey: string }
  | { ok: false; error: string; status: number };

function allowLegacyAuth(): boolean {
  // Read directly from process.env to avoid circular import with env.ts.
  // Default OFF — v1 is not endpoint-bound and is replay-able within the
  // 5-min timestamp window. Operators must opt in explicitly.
  return process.env.ALLOW_LEGACY_AUTH === "true";
}

/**
 * Pure verification logic — testable without a Next.js request context.
 * Accepts any object with a `.get(key)` method.
 */
export function verifyWalletAuthHeaders(hdrs: {
  get: (key: string) => string | null;
}): WalletAuthResult {
  const pubkeyB58 = hdrs.get("x-solana-pubkey");
  const signatureB58 = hdrs.get("x-solana-signature");
  const timestampStr = hdrs.get("x-solana-timestamp");
  const nonce = hdrs.get("x-solana-nonce");

  if (!pubkeyB58 || !signatureB58 || !timestampStr) {
    return {
      ok: false,
      error: "Wallet authentication required. Connect your wallet.",
      status: 401,
    };
  }

  // Validate pubkey
  let pubkeyBytes: Uint8Array;
  try {
    pubkeyBytes = new PublicKey(pubkeyB58).toBytes();
  } catch {
    return { ok: false, error: "Invalid wallet public key.", status: 401 };
  }

  // Validate timestamp freshness
  const timestamp = Number(timestampStr);
  if (Number.isNaN(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > AUTH_WINDOW_SECS) {
    return { ok: false, error: "Auth timestamp expired. Re-authenticate.", status: 401 };
  }

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = bs58.decode(signatureB58);
  } catch {
    return { ok: false, error: "Invalid signature encoding.", status: 401 };
  }

  // Detect v2 format: all three endpoint-binding headers must be present
  const method = hdrs.get("x-solana-method");
  const path = hdrs.get("x-solana-path");
  const bodyHash = hdrs.get("x-solana-body-hash");

  const isV2 = !!(method && path && bodyHash);

  if (isV2) {
    // v2: aegis:v2:{pubkey}:{ts}:{nonce}:{method}:{path+query}:{bodyHash}
    // Path may contain a query string (e.g. /api/payrolls/X/Y?includeSensitive=true).
    // We trim trailing slash on the pathname only; query is left as-is.
    if (!nonce || nonce.length === 0) {
      // v2 requires a nonce — without it, a captured signature replays for
      // the same {method, path, bodyHash, ts} within the 5min window.
      return { ok: false, error: "Missing wallet auth nonce.", status: 401 };
    }
    const queryStart = path.indexOf("?");
    const pathname = queryStart >= 0 ? path.slice(0, queryStart) : path;
    const search = queryStart >= 0 ? path.slice(queryStart) : "";
    const normalizedPath = (pathname.replace(/\/$/, "") || "/") + search;
    const message = `aegis:v2:${pubkeyB58}:${timestampStr}:${nonce}:${method.toUpperCase()}:${normalizedPath}:${bodyHash}`;
    const messageBytes = new TextEncoder().encode(message);
    const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes);
    if (!valid) {
      return { ok: false, error: "Invalid wallet signature.", status: 401 };
    }
  } else {
    // v1: aegis:{pubkey}:{ts}:{nonce}
    if (!allowLegacyAuth()) {
      return {
        ok: false,
        error: "v1 auth signatures are no longer accepted. Upgrade your client.",
        status: 401,
      };
    }
    const message = nonce
      ? `aegis:${pubkeyB58}:${timestampStr}:${nonce}`
      : `aegis:${pubkeyB58}:${timestampStr}`;
    const messageBytes = new TextEncoder().encode(message);
    const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes);
    if (!valid) {
      return { ok: false, error: "Invalid wallet signature.", status: 401 };
    }
  }

  return { ok: true, publicKey: pubkeyB58 };
}

/**
 * Reserve a wallet auth nonce so a captured signature cannot be replayed
 * within the timestamp window. Backed by the rate-limit store (Redis in
 * prod, in-memory dev fallback) — `count=1` over the reservation TTL means
 * the second presentation of the same (pubkey, nonce) tuple fails the gate.
 *
 * Returns true when the nonce was unused (first time seen), false when it
 * was already consumed by an earlier request. Exported so the v2 nonce
 * consumption test can exercise it without a Next request context.
 *
 * NOTE: in-memory fallback is per-process — multi-instance deploys must
 * have REDIS_URL set or replays are still possible across replicas.
 */
export async function consumeWalletNonce(pubkey: string, nonce: string): Promise<boolean> {
  const key = rateLimitBucket(pubkey, `wallet-nonce:${nonce}`);
  return await checkRateLimitAsync(key, 1, NONCE_RESERVATION_TTL_MS);
}

/**
 * Verify wallet authentication from incoming request headers.
 * Call this at the top of any API route handler.
 *
 * Order of preference:
 * 1. Session cookie (set by /api/auth/login). The cookie is HMAC-signed
 *    server-side — no replay risk.
 * 2. Per-request v1/v2 signature headers. Signature verification proves
 *    the pubkey owns the message, but a *captured* signature is valid for
 *    the timestamp window. After signature passes we therefore reserve the
 *    nonce so the same signature cannot be presented twice.
 */
export async function verifyWalletAuth(): Promise<WalletAuthResult> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
    const session = verifySessionToken(sessionCookie?.value);
    if (session) {
      return { ok: true, publicKey: session.publicKey };
    }
  } catch {
    // fall through to header-based auth
  }
  const hdrs = await headers();
  const result = verifyWalletAuthHeaders(hdrs);
  if (!result.ok) return result;

  // Replay defence — reserve the nonce so the same (pubkey, nonce) tuple
  // cannot be re-presented within the timestamp window. v2 always carries
  // a nonce (verifyWalletAuthHeaders enforces it). v1 *may* carry one and
  // we still consume it when present.
  const nonce = hdrs.get("x-solana-nonce");
  if (nonce && nonce.length > 0) {
    const firstUse = await consumeWalletNonce(result.publicKey, nonce);
    if (!firstUse) {
      return { ok: false, error: "Wallet auth nonce already used.", status: 401 };
    }
  }
  return result;
}

/**
 * Helper: if auth fails, return the error response directly.
 */
export function authErrorResponse(result: WalletAuthResult): Response | null {
  if (result.ok) return null;
  return NextResponse.json({ error: result.error }, { status: result.status });
}

/**
 * Verify wallet auth and return { publicKey } or a 401/403 NextResponse.
 */
export async function requireWalletAuth(): Promise<{ publicKey: string } | NextResponse> {
  const auth = await verifyWalletAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return { publicKey: auth.publicKey };
}
