/**
 * Server-side field-level encryption for sensitive database fields.
 *
 * Uses AES-256-GCM with a key derived from JWT_SIGNING_SECRET.
 * Each encryption gets a random 12-byte IV, prepended to the ciphertext.
 *
 * Format: base64(iv + ciphertext + authTag)
 * The IV and authTag are 12 + 16 bytes respectively.
 */

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const secret = process.env.JWT_SIGNING_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SIGNING_SECRET must be at least 16 characters for field encryption.");
  }

  // Derive a 32-byte key using SHA-256
  const { createHash } = require("crypto") as typeof import("crypto");
  cachedKey = createHash("sha256").update(secret).digest();
  return cachedKey;
}

/**
 * Encrypt a plaintext string. Returns base64(iv + ciphertext + authTag).
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

  return Buffer.concat([iv, encrypted, authTag]).toString("base64");
}

/**
 * Decrypt a ciphertext string. Accepts base64(iv + ciphertext + authTag).
 * Returns the original plaintext string.
 */
export function decryptField(ciphertext: string): string {
  const crypto = require("crypto") as typeof import("crypto");
  const key = getKey();

  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted) + decipher.final("utf8");
}

/**
 * Check if a value looks like an encrypted field.
 * Used to handle backward compatibility with unencrypted legacy data.
 *
 * AES-256-GCM ciphertext is base64-encoded and always contains uppercase letters (A-Z)
 * and/or +, / characters. Plaintext private keys in this codebase are hex strings
 * that only use [0-9a-f], so they never contain uppercase letters.
 */
export function isEncrypted(value: string | null): boolean {
  if (!value) return false;
  return /[A-Z+/]/.test(value);
}
