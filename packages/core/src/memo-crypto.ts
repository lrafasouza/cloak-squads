import nacl from "tweetnacl";

export type EncryptedMemo = {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  ephemeralPk: Uint8Array;
};

/**
 * Encrypts `memo` for a recipient identified by their NaCl box public key.
 * Uses an ephemeral sender keypair — discard the secret after calling.
 */
export function encryptMemo(memo: string, recipientVk: Uint8Array): EncryptedMemo {
  const ephemeralKp = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ciphertext = nacl.box(
    new TextEncoder().encode(memo),
    nonce,
    recipientVk,
    ephemeralKp.secretKey,
  );
  return { ciphertext, nonce, ephemeralPk: ephemeralKp.publicKey };
}

/**
 * Decrypts an encrypted memo using the recipient's NaCl box secret key.
 * Returns null if decryption fails (wrong key or tampered data).
 */
export function decryptMemo(env: EncryptedMemo, sk: Uint8Array): string | null {
  const plain = nacl.box.open(env.ciphertext, env.nonce, env.ephemeralPk, sk);
  if (!plain) return null;
  return new TextDecoder().decode(plain);
}

/**
 * Serializes an EncryptedMemo to a plain object with hex-encoded fields
 * for safe JSON transport / Prisma Bytes storage.
 */
export function serializeEncryptedMemo(env: EncryptedMemo): {
  memoCiphertext: string;
  memoNonce: string;
  memoEphemeralPk: string;
} {
  return {
    memoCiphertext: Buffer.from(env.ciphertext).toString("hex"),
    memoNonce: Buffer.from(env.nonce).toString("hex"),
    memoEphemeralPk: Buffer.from(env.ephemeralPk).toString("hex"),
  };
}

/**
 * Deserializes hex-encoded fields back into an EncryptedMemo.
 */
export function deserializeEncryptedMemo(fields: {
  memoCiphertext: string;
  memoNonce: string;
  memoEphemeralPk: string;
}): EncryptedMemo {
  return {
    ciphertext: Buffer.from(fields.memoCiphertext, "hex"),
    nonce: Buffer.from(fields.memoNonce, "hex"),
    ephemeralPk: Buffer.from(fields.memoEphemeralPk, "hex"),
  };
}
