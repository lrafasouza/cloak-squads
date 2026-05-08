/**
 * Session-cookie auth token (HMAC-signed, stateless).
 *
 * Issued by `/api/auth/login` after the user signs a one-time `aegis:session:`
 * message with their wallet. Subsequent API requests authenticate via the
 * httpOnly cookie set by the server, eliminating the per-request `signMessage`
 * wallet popup that plagued v2 endpoint-bound signatures.
 *
 * Token format: `<base64url(payload)>.<base64url(HMAC-SHA256(payload, secret))>`
 * Payload:      `{ aud: 'aegis-session', sub: <pubkey>, exp: <ms epoch> }`
 *
 * The cookie is httpOnly + SameSite=Lax + (secure in prod). HMAC secret is
 * derived from `SESSION_HMAC_KEY` (preferred) or `JWT_SIGNING_SECRET` as a
 * backward-compat fallback. Rotating either invalidates all live sessions —
 * users re-login on next request, which is fine for a 30-min cookie.
 */
import crypto from "node:crypto";

export const SESSION_COOKIE_NAME = "aegis-session";
export const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const TOKEN_AUDIENCE = "aegis-session";

function getSecret(): Buffer {
  // Prefer the purpose-specific env so a single leaked secret doesn't
  // simultaneously compromise sessions, encrypted PII, and audit signatures.
  // When SESSION_HMAC_KEY is set we domain-separate the derived bytes; when
  // we fall back to JWT_SIGNING_SECRET we keep the *legacy* derivation so
  // existing session cookies still verify after the rollout (they'd 401
  // otherwise and pop a wallet sign on every connected user simultaneously).
  const explicit = process.env.SESSION_HMAC_KEY;
  if (explicit && explicit.length >= 16) {
    return crypto.createHash("sha256").update(`session-hmac-v1:${explicit}`).digest();
  }
  const fallback = process.env.JWT_SIGNING_SECRET;
  if (!fallback || fallback.length < 16) {
    throw new Error("SESSION_HMAC_KEY (or JWT_SIGNING_SECRET fallback) must be set (>=16 chars).");
  }
  return crypto.createHash("sha256").update(fallback).digest();
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

export function createSessionToken(
  publicKey: string,
  ttlMs: number = SESSION_TTL_MS,
): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + ttlMs;
  const payload = JSON.stringify({ aud: TOKEN_AUDIENCE, sub: publicKey, exp: expiresAt });
  const payloadB64 = base64UrlEncode(payload);
  const sig = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest();
  const sigB64 = base64UrlEncode(sig);
  return { token: `${payloadB64}.${sigB64}`, expiresAt };
}

export function verifySessionToken(
  token: string | undefined | null,
): { publicKey: string; expiresAt: number } | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  let providedSig: Buffer;
  try {
    providedSig = base64UrlDecode(sigB64);
  } catch {
    return null;
  }

  const expectedSig = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest();
  if (providedSig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(providedSig, expectedSig)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") return null;
  const { aud, sub, exp } = payload as { aud?: unknown; sub?: unknown; exp?: unknown };
  if (aud !== TOKEN_AUDIENCE) return null;
  if (typeof sub !== "string" || sub.length === 0) return null;
  if (typeof exp !== "number" || exp < Date.now()) return null;

  return { publicKey: sub, expiresAt: exp };
}
