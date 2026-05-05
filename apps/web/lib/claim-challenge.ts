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
 * Using HMAC-signed tokens instead of an in-memory Map avoids losing state
 * across HMR reloads in development and across serverless instances in production.
 */

import { createHmac, timingSafeEqual } from "crypto";

const CHALLENGE_TTL_MS = 60_000;

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

  // payload = invoiceId|nonce|expiresAt
  const payload = `${invoiceId}|${nonce}|${expiresAt}`;
  const sig = signPayload(payload);
  // challengeId encodes all fields needed for verification — no server storage needed
  const challengeId = `${Buffer.from(payload).toString("base64url")}.${sig}`;

  return { challengeId, challenge: nonce };
}

/**
 * Verify and decode a challenge token.
 * Returns the nonce bytes if valid, null if expired or tampered.
 * Does NOT consume (stateless — no one-time enforcement, but replay window is
 * limited to TTL and requires a valid wallet auth + Ed25519 key to exploit).
 */
export function checkChallenge(invoiceId: string, challengeId: string): Uint8Array | null {
  try {
    const dotIdx = challengeId.lastIndexOf(".");
    if (dotIdx === -1) return null;

    const encodedPayload = challengeId.slice(0, dotIdx);
    const receivedSig = challengeId.slice(dotIdx + 1);

    const payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const expectedSig = signPayload(payload);

    // Constant-time comparison to prevent timing attacks
    if (!timingSafeEqual(Buffer.from(receivedSig), Buffer.from(expectedSig))) return null;

    const parts = payload.split("|");
    if (parts.length !== 3) return null;
    const tokenInvoiceId = parts[0]!;
    const nonce = parts[1]!;
    const expiresAtStr = parts[2]!;

    if (tokenInvoiceId !== invoiceId) return null;

    const expiresAt = Number(expiresAtStr);
    if (Number.isNaN(expiresAt) || Date.now() > expiresAt) return null;

    // Decode the nonce back to bytes
    const padding = "=".repeat((4 - (nonce.length % 4)) % 4);
    const base64 = nonce.replace(/-/g, "+").replace(/_/g, "/") + padding;
    return Uint8Array.from(Buffer.from(base64, "base64"));
  } catch {
    return null;
  }
}

/**
 * No-op: stateless tokens don't need explicit deletion.
 * Kept for API compatibility with the claim-data route.
 */
export function consumeChallenge(_invoiceId: string): void {
  // intentionally empty — tokens expire by TTL
}
