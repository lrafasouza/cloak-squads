/**
 * Tests for apps/web/lib/field-crypto.ts
 *
 * These tests run in Node.js and require JWT_SIGNING_SECRET in the environment.
 * vitest sets process.env before each test file via the setup below.
 */

import { beforeAll, describe, expect, test, vi } from "vitest";
import { decryptField, encryptField, isEncrypted } from "../../apps/web/lib/field-crypto";

beforeAll(() => {
  // Mirror production env: every purpose-specific key set explicitly.
  // Tests that exercise the JWT fallback path override locally.
  process.env.JWT_SIGNING_SECRET = "test-secret-at-least-16-chars-long";
  process.env.SESSION_HMAC_KEY = "test-session-hmac-key-32-chars!!";
  process.env.FIELD_CRYPTO_KEY = "test-field-crypto-key-32-chars!!";
  process.env.AUDIT_EXPORT_SIGN_KEY = "passphrase:test-audit-sign-key-32-chars!!aa";
});

describe("encryptField / decryptField", () => {
  test("round-trip: encrypt then decrypt returns original plaintext", () => {
    const original = "deadbeefcafebabe1234567890abcdef";
    const ciphertext = encryptField(original);
    expect(decryptField(ciphertext)).toBe(original);
  });

  test("output always starts with 'v1.'", () => {
    const out = encryptField("hello");
    expect(out.startsWith("v1.")).toBe(true);
  });

  test("two encryptions of the same value produce different ciphertexts (random IV)", () => {
    const a = encryptField("same-value");
    const b = encryptField("same-value");
    expect(a).not.toBe(b);
    // Both decrypt to the same plaintext
    expect(decryptField(a)).toBe(decryptField(b));
  });

  test("decryptField accepts legacy format (base64 without v1. prefix)", () => {
    // Simulate a legacy ciphertext by stripping the prefix after encrypting
    const modernCiphertext = encryptField("legacy-value");
    const legacyFormat = modernCiphertext.slice("v1.".length);
    expect(decryptField(legacyFormat)).toBe("legacy-value");
  });

  test("tampering with one byte of the ciphertext throws (GCM auth tag check)", () => {
    const ciphertext = encryptField("secret-data");
    const rawBase64 = ciphertext.slice("v1.".length);
    const buf = Buffer.from(rawBase64, "base64");
    // Flip a bit in the ciphertext portion (skip IV of 12 bytes, flip byte 13)
    buf[13] ^= 0xff;
    const tampered = `v1.${buf.toString("base64")}`;
    expect(() => decryptField(tampered)).toThrow();
  });

  test("tampering with the authTag causes decryption to throw", () => {
    const ciphertext = encryptField("sensitive");
    // Corrupt the last byte (authTag end) — simulates a wrong key without
    // having to re-import the module.
    const rawBase64 = ciphertext.slice("v1.".length);
    const buf = Buffer.from(rawBase64, "base64");
    buf[buf.length - 1] ^= 0x01;
    const corrupted = `v1.${buf.toString("base64")}`;
    expect(() => decryptField(corrupted)).toThrow();
  });
});

describe("isEncrypted", () => {
  test("returns true for v1. prefixed values", () => {
    expect(isEncrypted(encryptField("anything"))).toBe(true);
  });

  test("returns false for null", () => {
    expect(isEncrypted(null)).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(isEncrypted(undefined)).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isEncrypted("")).toBe(false);
  });

  test("returns false for hex key (legacy unencrypted)", () => {
    expect(isEncrypted("deadbeefcafebabe1234567890abcdef1234567890abcdef1234567890abcdef")).toBe(
      false,
    );
  });

  test("returns false for arbitrary base64 without v1. prefix (legacy)", () => {
    expect(isEncrypted("SGVsbG8gV29ybGQ=")).toBe(false);
  });
});

describe("key requirement", () => {
  test("FIELD_CRYPTO_KEY is required — JWT_SIGNING_SECRET no longer satisfies", async () => {
    vi.resetModules();
    delete process.env.FIELD_CRYPTO_KEY;
    process.env.JWT_SIGNING_SECRET = "jwt-only-deployment-1234567890";
    const { encryptField: encA } = await import("../../apps/web/lib/field-crypto");
    expect(() => encA("data")).toThrow(/FIELD_CRYPTO_KEY/);
    // Restore for subsequent suites
    process.env.FIELD_CRYPTO_KEY = "test-field-crypto-key-32-chars!!";
  });

  test("ciphertext under one FIELD_CRYPTO_KEY can't decrypt under another (no PREVIOUS)", async () => {
    vi.resetModules();
    delete process.env.FIELD_CRYPTO_KEY_PREVIOUS;
    process.env.FIELD_CRYPTO_KEY = "first-key-1234567890abcdefghi!!";
    const { encryptField: encA } = await import("../../apps/web/lib/field-crypto");
    const ct = encA("payload");

    vi.resetModules();
    process.env.FIELD_CRYPTO_KEY = "second-key-9876543210xyzzzzzz!!";
    delete process.env.FIELD_CRYPTO_KEY_PREVIOUS;
    const { decryptField: decB } = await import("../../apps/web/lib/field-crypto");
    expect(() => decB(ct)).toThrow();

    // Restore
    process.env.FIELD_CRYPTO_KEY = "test-field-crypto-key-32-chars!!";
  });
});

describe("dual-read rotation (FIELD_CRYPTO_KEY_PREVIOUS)", () => {
  test("ciphertext encrypted under PREVIOUS decrypts when CURRENT is rotated", async () => {
    // Phase 1: encrypt under the "old" key
    vi.resetModules();
    delete process.env.FIELD_CRYPTO_KEY_PREVIOUS;
    process.env.FIELD_CRYPTO_KEY = "old-rotation-key-1234567890abcde";
    const { encryptField: encOld } = await import("../../apps/web/lib/field-crypto");
    const ciphertext = encOld("rotation-payload");

    // Phase 2: rotate — set the new key as CURRENT, old as PREVIOUS
    vi.resetModules();
    process.env.FIELD_CRYPTO_KEY = "new-rotation-key-9876543210xyzab";
    process.env.FIELD_CRYPTO_KEY_PREVIOUS = "old-rotation-key-1234567890abcde";
    const { decryptField: decRotated, encryptField: encNew } = await import(
      "../../apps/web/lib/field-crypto"
    );
    // Reads still work — current key fails, previous succeeds.
    expect(decRotated(ciphertext)).toBe("rotation-payload");

    // New writes go under CURRENT; reading those without PREVIOUS works fine.
    const fresh = encNew("post-rotation");
    vi.resetModules();
    process.env.FIELD_CRYPTO_KEY = "new-rotation-key-9876543210xyzab";
    delete process.env.FIELD_CRYPTO_KEY_PREVIOUS;
    const { decryptField: decAfter } = await import("../../apps/web/lib/field-crypto");
    expect(decAfter(fresh)).toBe("post-rotation");
  });

  test("dropping PREVIOUS after rotation makes old ciphertext unreadable", async () => {
    vi.resetModules();
    delete process.env.FIELD_CRYPTO_KEY_PREVIOUS;
    process.env.FIELD_CRYPTO_KEY = "old-rotation-key-1234567890abcde";
    const { encryptField: encOld } = await import("../../apps/web/lib/field-crypto");
    const oldCiphertext = encOld("orphaned");

    vi.resetModules();
    process.env.FIELD_CRYPTO_KEY = "new-rotation-key-9876543210xyzab";
    delete process.env.FIELD_CRYPTO_KEY_PREVIOUS; // operator forgot to back-fill
    const { decryptField: decOrphan } = await import("../../apps/web/lib/field-crypto");
    expect(() => decOrphan(oldCiphertext)).toThrow();
  });

  test("PREVIOUS shorter than 16 chars is ignored (treated as unset)", async () => {
    vi.resetModules();
    process.env.FIELD_CRYPTO_KEY = "current-key-at-least-16-chars-x";
    process.env.FIELD_CRYPTO_KEY_PREVIOUS = "tiny";
    const { encryptField: enc, decryptField: dec } = await import(
      "../../apps/web/lib/field-crypto"
    );
    // Round-trip works because PREVIOUS is silently ignored (under-length).
    expect(dec(enc("payload"))).toBe("payload");
    delete process.env.FIELD_CRYPTO_KEY_PREVIOUS;
  });
});
