import nacl from "tweetnacl";
import { describe, expect, test } from "vitest";
import {
  decryptMemo,
  deserializeEncryptedMemo,
  encryptMemo,
  serializeEncryptedMemo,
} from "../src/memo-crypto";

describe("memo-crypto", () => {
  test("encryptMemo + decryptMemo round-trip preserves the plaintext", () => {
    const recipient = nacl.box.keyPair();
    const memo = "salary payment — Q2 2026";

    const env = encryptMemo(memo, recipient.publicKey);
    const decrypted = decryptMemo(env, recipient.secretKey);

    expect(decrypted).toBe(memo);
  });

  test("encryptMemo emits 24-byte nonce and 32-byte ephemeralPk", () => {
    const recipient = nacl.box.keyPair();
    const env = encryptMemo("anything", recipient.publicKey);

    expect(env.nonce).toHaveLength(nacl.box.nonceLength); // 24
    expect(env.ephemeralPk).toHaveLength(32);
    expect(env.ciphertext.length).toBeGreaterThan(0);
  });

  test("decryptMemo returns null when the wrong recipient secret key is used", () => {
    const recipient = nacl.box.keyPair();
    const attacker = nacl.box.keyPair();
    const env = encryptMemo("secret", recipient.publicKey);

    expect(decryptMemo(env, attacker.secretKey)).toBeNull();
  });

  test("decryptMemo returns null when the ciphertext is tampered", () => {
    const recipient = nacl.box.keyPair();
    const env = encryptMemo("payload", recipient.publicKey);

    // Flip one byte of the ciphertext.
    const tampered = {
      ...env,
      ciphertext: new Uint8Array(env.ciphertext),
    };
    tampered.ciphertext[0] = tampered.ciphertext[0] ^ 0x01;

    expect(decryptMemo(tampered, recipient.secretKey)).toBeNull();
  });

  test("decryptMemo returns null when the nonce is tampered", () => {
    const recipient = nacl.box.keyPair();
    const env = encryptMemo("payload", recipient.publicKey);

    const tampered = {
      ...env,
      nonce: new Uint8Array(env.nonce),
    };
    tampered.nonce[0] = tampered.nonce[0] ^ 0x01;

    expect(decryptMemo(tampered, recipient.secretKey)).toBeNull();
  });

  test("encryptMemo is non-deterministic: same input produces different ciphertexts", () => {
    const recipient = nacl.box.keyPair();
    const memo = "same plaintext";

    const a = encryptMemo(memo, recipient.publicKey);
    const b = encryptMemo(memo, recipient.publicKey);

    // ephemeral keypair differs, so ciphertext + nonce + ephemeralPk all differ
    expect(Array.from(a.ciphertext)).not.toEqual(Array.from(b.ciphertext));
    expect(Array.from(a.nonce)).not.toEqual(Array.from(b.nonce));
    expect(Array.from(a.ephemeralPk)).not.toEqual(Array.from(b.ephemeralPk));
    // Both still decrypt to the same plaintext.
    expect(decryptMemo(a, recipient.secretKey)).toBe(memo);
    expect(decryptMemo(b, recipient.secretKey)).toBe(memo);
  });

  test("round-trip preserves UTF-8 edge cases (emoji + multibyte)", () => {
    const recipient = nacl.box.keyPair();
    const memo = "Olá 👋 — ¥1,234.56 · 漢字 · 🇧🇷";

    const env = encryptMemo(memo, recipient.publicKey);
    expect(decryptMemo(env, recipient.secretKey)).toBe(memo);
  });

  test("round-trip preserves empty string", () => {
    const recipient = nacl.box.keyPair();
    const env = encryptMemo("", recipient.publicKey);

    expect(decryptMemo(env, recipient.secretKey)).toBe("");
  });

  test("serializeEncryptedMemo + deserializeEncryptedMemo round-trip preserves bytes", () => {
    const recipient = nacl.box.keyPair();
    const env = encryptMemo("payload", recipient.publicKey);

    const serialized = serializeEncryptedMemo(env);
    expect(typeof serialized.memoCiphertext).toBe("string");
    expect(typeof serialized.memoNonce).toBe("string");
    expect(typeof serialized.memoEphemeralPk).toBe("string");
    // Hex strings are 2 chars per byte.
    expect(serialized.memoNonce).toHaveLength(env.nonce.length * 2);
    expect(serialized.memoEphemeralPk).toHaveLength(env.ephemeralPk.length * 2);

    const rebuilt = deserializeEncryptedMemo(serialized);
    expect(Array.from(rebuilt.ciphertext)).toEqual(Array.from(env.ciphertext));
    expect(Array.from(rebuilt.nonce)).toEqual(Array.from(env.nonce));
    expect(Array.from(rebuilt.ephemeralPk)).toEqual(Array.from(env.ephemeralPk));
  });

  test("decrypt works after a serialize/deserialize round-trip", () => {
    const recipient = nacl.box.keyPair();
    const memo = "after JSON transport";

    const serialized = serializeEncryptedMemo(encryptMemo(memo, recipient.publicKey));
    const rebuilt = deserializeEncryptedMemo(serialized);

    expect(decryptMemo(rebuilt, recipient.secretKey)).toBe(memo);
  });
});
