/**
 * Server-side field-level encryption for sensitive database fields.
 *
 * Algorithm: AES-256-GCM
 * Encrypt key: SHA-256(FIELD_CRYPTO_KEY) — falls back to JWT_SIGNING_SECRET
 *              if the purpose-specific env is unset (production boot
 *              already fails-loud when missing — see env.ts).
 * Decrypt key: tries the encrypt key first; on AES-GCM auth-tag failure
 *              falls back to SHA-256(FIELD_CRYPTO_KEY_PREVIOUS) when set.
 *              This is the dual-read window during a key rotation —
 *              writes go to the new key, reads accept either, and the
 *              `rotate-field-crypto.ts` script back-fills rows in batch.
 * IV:        12 random bytes per encryption.
 * Output:    "v1." + base64(iv + ciphertext + authTag).
 *
 * The "v1." prefix enables version detection. Legacy rows without the
 * prefix are treated as unencrypted plaintext (backward-compat read path
 * only; all writes produce v1. format).
 *
 * Rotation runbook:
 *   1. Set FIELD_CRYPTO_KEY_PREVIOUS = (current FIELD_CRYPTO_KEY value).
 *   2. Set FIELD_CRYPTO_KEY          = (new value).
 *   3. Deploy. Reads accept both, writes go to the new key.
 *   4. Run `pnpm tsx apps/web/prisma/scripts/rotate-field-crypto.ts`.
 *      Re-encrypts every v1. row by decrypting under either current or
 *      previous, then writing under current.
 *   5. Once dry-run reports zero rows under PREVIOUS, unset
 *      FIELD_CRYPTO_KEY_PREVIOUS and redeploy.
 */

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const V1_PREFIX = "v1.";

let cachedCurrent: Buffer | null = null;
let cachedPrevious: Buffer | null = null;
let cachedPreviousLoaded = false;

function deriveKey(secret: string): Buffer {
  const { createHash } = require("crypto") as typeof import("crypto");
  return createHash("sha256").update(secret).digest();
}

function getCurrentKey(): Buffer {
  if (cachedCurrent) return cachedCurrent;

  // Prefer the purpose-specific FIELD_CRYPTO_KEY. Fall back to
  // JWT_SIGNING_SECRET so deployments that haven't split secrets yet keep
  // decrypting their existing rows. Operators rotating FIELD_CRYPTO_KEY
  // must set FIELD_CRYPTO_KEY_PREVIOUS during the migration window —
  // dropping the old key without a back-fill makes every prior `v1.` row
  // permanently undecryptable.
  const secret = process.env.FIELD_CRYPTO_KEY ?? process.env.JWT_SIGNING_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "FIELD_CRYPTO_KEY (or JWT_SIGNING_SECRET fallback) must be at least 16 characters.",
    );
  }
  cachedCurrent = deriveKey(secret);
  return cachedCurrent;
}

/**
 * Returns the previous-key buffer if FIELD_CRYPTO_KEY_PREVIOUS is set
 * (rotation in progress), otherwise null. Cached on first read; the cache
 * is reset by `_resetFieldCryptoKeyCache` for tests.
 */
function getPreviousKey(): Buffer | null {
  if (cachedPreviousLoaded) return cachedPrevious;
  cachedPreviousLoaded = true;

  const prev = process.env.FIELD_CRYPTO_KEY_PREVIOUS;
  if (!prev || prev.length < 16) {
    cachedPrevious = null;
    return null;
  }
  cachedPrevious = deriveKey(prev);
  return cachedPrevious;
}

/** Test-only: reset the cached keys so changing process.env between tests
 *  is honoured. No-op in production code paths. */
export function _resetFieldCryptoKeyCache(): void {
  cachedCurrent = null;
  cachedPrevious = null;
  cachedPreviousLoaded = false;
}

/**
 * Encrypt a plaintext string.
 * Returns "v1." + base64(iv + ciphertext + authTag).
 *
 * Always writes under the *current* key. During a rotation window, reads
 * accept the previous key too (see `decryptField`).
 */
export function encryptField(plaintext: string): string {
  const crypto = require("crypto") as typeof import("crypto");
  const key = getCurrentKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return V1_PREFIX + Buffer.concat([iv, encrypted, authTag]).toString("base64");
}

function tryDecrypt(key: Buffer, iv: Buffer, encrypted: Buffer, authTag: Buffer): string {
  const crypto = require("crypto") as typeof import("crypto");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

/**
 * Decrypt a ciphertext string.
 * Accepts v1. format ("v1." + base64) and legacy bare-base64 format.
 * Returns the original plaintext string.
 *
 * Dual-read: tries the current key first; if AES-GCM authentication fails
 * AND `FIELD_CRYPTO_KEY_PREVIOUS` is set, retries with the previous key.
 * This is the read-side of the rotation window — `rotate-field-crypto.ts`
 * back-fills rows so subsequent reads succeed under the current key.
 */
export function decryptField(ciphertext: string): string {
  const raw = ciphertext.startsWith(V1_PREFIX)
    ? ciphertext.slice(V1_PREFIX.length)
    : ciphertext;

  const data = Buffer.from(raw, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);

  const current = getCurrentKey();
  try {
    return tryDecrypt(current, iv, encrypted, authTag);
  } catch (currentErr) {
    // AES-GCM throws on auth-tag mismatch — that's the rotation signal.
    const previous = getPreviousKey();
    if (!previous) throw currentErr;
    try {
      return tryDecrypt(previous, iv, encrypted, authTag);
    } catch {
      // Surface the original error so the caller sees the *current*-key
      // failure (the operationally interesting one) rather than the
      // dual-read attempt.
      throw currentErr;
    }
  }
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
