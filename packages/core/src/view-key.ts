import nacl from "tweetnacl";
import type { BoxKeyPair } from "./derivation";
import type { EncryptedViewKeyEntry } from "./types";

export function encryptViewKeyForSigner(
  viewKeyPrivate: Uint8Array,
  signerSolanaPubkey: Uint8Array,
): EncryptedViewKeyEntry {
  if (viewKeyPrivate.length !== 32) {
    throw new Error("view key must be 32 bytes");
  }
  if (signerSolanaPubkey.length !== 32) {
    throw new Error("signer pubkey must be 32 bytes");
  }

  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(24);
  const ciphertext = nacl.box(viewKeyPrivate, nonce, signerSolanaPubkey, ephemeral.secretKey);

  return {
    signer: signerSolanaPubkey,
    ephemeralPk: ephemeral.publicKey,
    nonce,
    ciphertext,
    addedAt: BigInt(Date.now()),
  };
}

export function decryptViewKey(
  entry: EncryptedViewKeyEntry,
  signerDecryptKeyPair: BoxKeyPair,
): Uint8Array {
  const decrypted = nacl.box.open(entry.ciphertext, entry.nonce, entry.ephemeralPk, signerDecryptKeyPair.secretKey);

  if (!decrypted) {
    throw new Error("failed to decrypt view key (wrong signer or corrupted)");
  }

  return decrypted;
}
