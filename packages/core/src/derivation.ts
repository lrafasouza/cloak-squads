import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import nacl from "tweetnacl";
import type { PublicKey } from "@solana/web3.js";
import type { CloakKeyPair } from "@cloak.dev/sdk";
import { concatBytes, domainSeparator } from "./encoding";

export type BoxKeyPair = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
};

const PAYLOAD_DOMAIN_SEP = "cloak-squads-operator-v1";

function getGenerateCloakKeys(): (seed: Uint8Array) => CloakKeyPair {
  if (typeof window === "undefined") {
    throw new Error("Cloak SDK only available in the browser runtime");
  }
  const fn = (window as unknown as { generateCloakKeys?: unknown }).generateCloakKeys;
  if (typeof fn !== "function") {
    throw new Error("generateCloakKeys not available on window");
  }
  return fn as (seed: Uint8Array) => CloakKeyPair;
}

export async function deriveOperatorCloakKeys(
  multisig: PublicKey,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
): Promise<CloakKeyPair> {
  const message = new TextEncoder().encode(`cloak-squads-operator-v1:${multisig.toBase58()}`);
  const signature = await signMessage(message);

  const masterSeed = sha256(
    concatBytes(domainSeparator(PAYLOAD_DOMAIN_SEP), multisig.toBytes(), signature),
  );

  return getGenerateCloakKeys()(masterSeed);
}

export async function deriveSignerDecryptKeypair(
  multisig: PublicKey,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
): Promise<BoxKeyPair> {
  const message = new TextEncoder().encode(`cloak-squads-view-decrypt-v1:${multisig.toBase58()}`);
  const signature = await signMessage(message);

  const seed = hkdf(sha256, signature, undefined, new TextEncoder().encode("view-decrypt"), 32);
  const keyPair = nacl.box.keyPair.fromSecretKey(seed);

  return {
    secretKey: new Uint8Array(keyPair.secretKey),
    publicKey: new Uint8Array(keyPair.publicKey),
  };
}
