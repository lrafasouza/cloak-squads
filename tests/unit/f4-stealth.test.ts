import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { describe, expect, it } from "vitest";
import {
  decryptViewKey,
  encryptViewKeyForSigner,
} from "../../packages/core/src/view-key";

describe("F4 stealth — crypto primitives", () => {
  it("nacl.box.keyPair produces valid 32-byte pubkey + 32-byte secret", () => {
    const kp = nacl.box.keyPair();
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey.length).toBe(32);
    expect(kp.secretKey).toBeInstanceOf(Uint8Array);
    expect(kp.secretKey.length).toBe(32);
  });

  it("encryptViewKeyForSigner → decryptViewKey round-trips bytes exactly", () => {
    const viewKey = nacl.randomBytes(32);
    const signer = Keypair.generate();
    const signerBoxKp = nacl.box.keyPair.fromSecretKey(signer.secretKey.slice(0, 32));

    const entry = encryptViewKeyForSigner(viewKey, signerBoxKp.publicKey);
    const decrypted = decryptViewKey(entry, signerBoxKp);

    expect(Buffer.from(decrypted)).toEqual(Buffer.from(viewKey));
  });

  it("decryptViewKey throws on wrong signer", () => {
    const viewKey = nacl.randomBytes(32);
    const signer1 = nacl.box.keyPair();
    const signer2 = nacl.box.keyPair();

    const entry = encryptViewKeyForSigner(viewKey, signer1.publicKey);
    expect(() => decryptViewKey(entry, signer2)).toThrow(/failed to decrypt/);
  });
});

describe("F4 stealth — URL fragment build/parse", () => {
  function buildFragment(stealthId: string, secretKey: Uint8Array): string {
    const sk = Buffer.from(secretKey).toString("base64url");
    return `#sk=${sk}&id=${stealthId}`;
  }

  function parseFragment(fragment: string): { stealthId: string; secretKey: Uint8Array } {
    const params = new URLSearchParams(fragment.replace(/^#/, ""));
    const sk = params.get("sk");
    const id = params.get("id");
    if (!sk || !id) throw new Error("invalid fragment");
    return { stealthId: id, secretKey: new Uint8Array(Buffer.from(sk, "base64url")) };
  }

  it("build → parse is lossless", () => {
    const id = "stealth_abc123";
    const sk = nacl.randomBytes(32);
    const fragment = buildFragment(id, sk);
    const parsed = parseFragment(fragment);
    expect(parsed.stealthId).toBe(id);
    expect(Buffer.from(parsed.secretKey)).toEqual(Buffer.from(sk));
  });

  it("parseFragment throws on malformed input", () => {
    expect(() => parseFragment("#nope")).toThrow();
    expect(() => parseFragment("")).toThrow();
  });
});
