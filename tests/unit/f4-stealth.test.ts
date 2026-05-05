import assert from "node:assert/strict";
import nacl from "tweetnacl";
import { test } from "vitest";

function encryptViewKeyForSigner(viewKey: Uint8Array, signerPublicKey: Uint8Array) {
  const ephemeralKp = nacl.box.keyPair();
  const nonce = new Uint8Array(24);
  const encrypted = nacl.box(viewKey, nonce, signerPublicKey, ephemeralKp.secretKey);
  return { ephemeralPublicKey: ephemeralKp.publicKey, encrypted, nonce };
}

function decryptViewKey(entry: { ephemeralPublicKey: Uint8Array; encrypted: Uint8Array; nonce: Uint8Array }, signerBoxKp: nacl.BoxKeyPair) {
  const decrypted = nacl.box.open(entry.encrypted, entry.nonce, entry.ephemeralPublicKey, signerBoxKp.secretKey);
  if (!decrypted) throw new Error("failed to decrypt view key");
  return decrypted;
}

test("nacl.box.keyPair produces valid 32-byte pubkey + 32-byte secret", () => {
  const kp = nacl.box.keyPair();
  assert.ok(kp.publicKey instanceof Uint8Array);
  assert.equal(kp.publicKey.length, 32);
  assert.ok(kp.secretKey instanceof Uint8Array);
  assert.equal(kp.secretKey.length, 32);
});

test("encryptViewKeyForSigner → decryptViewKey round-trips bytes exactly", () => {
  const viewKey = nacl.randomBytes(32);
  const signerBoxKp = nacl.box.keyPair();

  const entry = encryptViewKeyForSigner(viewKey, signerBoxKp.publicKey);
  const decrypted = decryptViewKey(entry, signerBoxKp);

  assert.deepEqual(Buffer.from(decrypted), Buffer.from(viewKey));
});

test("decryptViewKey throws on wrong signer", () => {
  const viewKey = nacl.randomBytes(32);
  const signer1 = nacl.box.keyPair();
  const signer2 = nacl.box.keyPair();

  const entry = encryptViewKeyForSigner(viewKey, signer1.publicKey);
  assert.throws(() => decryptViewKey(entry, signer2), /failed to decrypt/);
});

test("URL fragment build → parse is lossless", () => {
  const id = "stealth_abc123";
  const sk = nacl.randomBytes(32);
  const fragment = `#sk=${Buffer.from(sk).toString("base64url")}&id=${id}`;

  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  const parsedSk = params.get("sk");
  const parsedId = params.get("id");

  assert.equal(parsedId, id);
  assert.deepEqual(new Uint8Array(Buffer.from(parsedSk!, "base64url")), sk);
});

test("URL fragment parse returns null for malformed input", () => {
  const params = new URLSearchParams("#nope".replace(/^#/, ""));
  assert.equal(params.get("sk"), null);
  assert.equal(params.get("id"), null);
});
