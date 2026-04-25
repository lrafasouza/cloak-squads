import nacl from "tweetnacl";
import { describe, expect, test } from "vitest";
import { decryptViewKey, encryptViewKeyForSigner } from "../src/view-key";

describe("view key distribution", () => {
  test("encryptViewKeyForSigner and decryptViewKey round-trip for a nacl box keypair", () => {
    const signer = nacl.box.keyPair();
    const viewKey = new Uint8Array(32).fill(12);

    const encrypted = encryptViewKeyForSigner(viewKey, signer.publicKey);
    const decrypted = decryptViewKey(encrypted, signer);

    expect(Array.from(decrypted)).toEqual(Array.from(viewKey));
    expect(encrypted.ephemeralPk).toHaveLength(32);
    expect(encrypted.nonce).toHaveLength(24);
  });

  test("decryptViewKey rejects the wrong signer", () => {
    const signer = nacl.box.keyPair();
    const wrongSigner = nacl.box.keyPair();
    const encrypted = encryptViewKeyForSigner(new Uint8Array(32).fill(12), signer.publicKey);

    expect(() => decryptViewKey(encrypted, wrongSigner)).toThrow("failed to decrypt view key");
  });
});
