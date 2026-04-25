import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import nacl from "tweetnacl";
import { x25519 } from "@noble/curves/x25519";
import { PublicKey } from "@solana/web3.js";
import type { CloakKeyPair } from "@cloak.dev/sdk";

const PAYLOAD_DOMAIN_SEP = "cloak-squads-operator-v1\0";
const VIEW_DECRYPT_DOMAIN = "cloak-squads-view-decrypt-v1:";

export async function deriveOperatorCloakKeys(
  multisig: PublicKey,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
): Promise<CloakKeyPair> {
  const message = new TextEncoder().encode(`cloak-squads-operator-v1:${multisig.toBase58()}`);
  const signature = await signMessage(message);

  const masterSeed = sha256(
    concatBytes(
      domainSeparator(PAYLOAD_DOMAIN_SEP),
      multisig.toBytes(),
      signature,
    ),
  );

  return (window as any).generateCloakKeys(masterSeed);
}

export async function deriveSignerDecryptKeypair(
  multisig: PublicKey,
  signMessage: (message: Uint8Array) => Promise<nacl.BoxKeyPair>,
): Promise<nacl.BoxKeyPair> {
  const message = new TextEncoder().encode(`cloak-squads-view-decrypt-v1:${multisig.toBase58()}`);
  const signature = await signMessage(message);

  const seed = hkdf(sha256, signature, undefined, new TextEncoder().encode("view-decrypt"), 32);
  const secretKey = x25519.getPrivateKey(seed);
  const publicKey = x25519.getPublicKey(seed);

  return {
    secretKey: new Uint8Array(secretKey),
    publicKey: new Uint8Array(publicKey),
  };
}
