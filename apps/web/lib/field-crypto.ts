/**
 * Server-side field-level encryption for sensitive database fields.
 *
 * Algorithm: AES-256-GCM
 * Key: SHA-256(JWT_SIGNING_SECRET)
 * IV: 12 random bytes per encryption
 * Output format: "v1." + base64(iv + ciphertext + authTag)
 *
 * The "v1." prefix enables version detection and future key rotation.
 * Legacy rows without the prefix are treated as unencrypted plaintext
 * (backward-compat read path only; all writes produce v1. format).
 *
 * Key rotation path (future): introduce "v2.{kid}.{ciphertext}" and
 * keep JWT_SIGNING_SECRET_PREVIOUS in env during the transition window.
 */

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const V1_PREFIX = "v1.";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const secret = process.env.JWT_SIGNING_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SIGNING_SECRET must be at least 16 characters for field encryption.");
  }

  const { createHash } = require("crypto") as typeof import("crypto");
  cachedKey = createHash("sha256").update(secret).digest();
  return cachedKey;
}

/**
 * Encrypt a plaintext string.
 * Returns "v1." + base64(iv + ciphertext + authTag).
 */
export function encryptField(plaintext: string): string {
  const crypto = require("crypto") as typeof import("crypto");
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return V1_PREFIX + Buffer.concat([iv, encrypted, authTag]).toString("base64");
}

/**
 * Decrypt a ciphertext string.
 * Accepts v1. format ("v1." + base64) and legacy bare-base64 format.
 * Returns the original plaintext string.
 */
export function decryptField(ciphertext: string): string {
  const crypto = require("crypto") as typeof import("crypto");
  const key = getKey();

  const raw = ciphertext.startsWith(V1_PREFIX)
    ? ciphertext.slice(V1_PREFIX.length)
    : ciphertext;

  const data = Buffer.from(raw, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted) + decipher.final("utf8");
}

/**
 * Returns true if the value is an encrypted field (v1. prefix).
 * Legacy hex keys (all lowercase [0-9a-f]) return false.
 * Null / empty return false.
 */
export function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith(V1_PREFIX);
}
