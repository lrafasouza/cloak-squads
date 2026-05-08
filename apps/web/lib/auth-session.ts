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
 * derived from `SESSION_HMAC_KEY` with a `session-hmac-v1:` domain
 * separator so the same env can also feed `claim-challenge` (under a
 * different separator) without the two derived keys colliding. Rotating
 * SESSION_HMAC_KEY invalidates every live session — users re-login on
 * the next request, which is fine for a 30-min cookie.
 */
import crypto from "node:crypto";

export const SESSION_COOKIE_NAME = "aegis-session";
export const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const TOKEN_AUDIENCE = "aegis-session";

function getSecret(): Buffer {
  const key = process.env.SESSION_HMAC_KEY;
  if (!key || key.length < 16) {
    // Production boot already fails-loud via env.ts superRefine; this guard
    // catches dev/test environments that haven't migrated off JWT_SIGNING_SECRET
    // yet and surfaces the right env-var name in the error.
    throw new Error("SESSION_HMAC_KEY must be set (>=16 chars).");
  }
  return crypto.createHash("sha256").update(`session-hmac-v1:${key}`).digest();
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
