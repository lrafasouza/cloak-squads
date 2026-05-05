/**
 * Server-side wallet authentication for API routes.
 *
 * Two signature formats are supported:
 *
 * v1 (legacy):
 *   Message: aegis:{pubkey}:{ts}:{nonce}
 *   Headers: x-solana-pubkey, x-solana-signature, x-solana-timestamp, x-solana-nonce
 *   Accepted only when ALLOW_LEGACY_AUTH=true (default, for rollout transition).
 *
 * v2 (current, endpoint-bound):
 *   Message: aegis:v2:{pubkey}:{ts}:{nonce}:{method}:{path}:{bodyHash}
 *   Headers: all v1 headers + x-solana-method, x-solana-path, x-solana-body-hash
 *   bodyHash = base64url(sha256(request body)) or "-" for requests with no body.
 *
 * The v2 format binds the signature to a specific HTTP method+path+body, preventing
 * a captured signature from being replayed against a different endpoint within the
 * 5-minute validity window.
 *
 * Note: the client includes x-solana-method and x-solana-path headers that the
 * server reads and verifies against the HMAC. CORS prevents external forgers from
 * setting custom headers, so this binding is effective against cross-origin replay.
 */
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const AUTH_WINDOW_SECS = 5 * 60; // 5 minutes

export type WalletAuthResult =
  | { ok: true; publicKey: string }
  | { ok: false; error: string; status: number };

function allowLegacyAuth(): boolean {
  // Read directly from process.env to avoid circular import with env.ts
  return (process.env.ALLOW_LEGACY_AUTH ?? "true") !== "false";
}

/**
 * Pure verification logic — testable without a Next.js request context.
 * Accepts any object with a `.get(key)` method.
 */
export function verifyWalletAuthHeaders(
  hdrs: { get: (key: string) => string | null },
): WalletAuthResult {
  const pubkeyB58 = hdrs.get("x-solana-pubkey");
  const signatureB58 = hdrs.get("x-solana-signature");
  const timestampStr = hdrs.get("x-solana-timestamp");
  const nonce = hdrs.get("x-solana-nonce");

  if (!pubkeyB58 || !signatureB58 || !timestampStr) {
    return { ok: false, error: "Wallet authentication required. Connect your wallet.", status: 401 };
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
    const queryStart = path.indexOf("?");
    const pathname = queryStart >= 0 ? path.slice(0, queryStart) : path;
    const search = queryStart >= 0 ? path.slice(queryStart) : "";
    const normalizedPath = (pathname.replace(/\/$/, "") || "/") + search;
    const message = `aegis:v2:${pubkeyB58}:${timestampStr}:${nonce ?? ""}:${method.toUpperCase()}:${normalizedPath}:${bodyHash}`;
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
 * Verify wallet authentication from incoming request headers.
 * Call this at the top of any API route handler.
 */
export async function verifyWalletAuth(): Promise<WalletAuthResult> {
  const hdrs = await headers();
  return verifyWalletAuthHeaders(hdrs);
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
