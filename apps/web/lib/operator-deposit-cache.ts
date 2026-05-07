// Cache layer for the operator's Cloak deposit step. The runtime Utxo
// returned by the Cloak SDK carries `bigint` fields and a `PublicKey`
// instance, both of which break naive `JSON.stringify`: `BigInt` throws,
// `PublicKey` collapses to a base58 string and loses its type identity on
// parse. This module provides a JSON-safe shape and a structural
// serializer/deserializer pair so the operator page can persist deposit
// state across retries without re-depositing on the next click.

import type { MerkleTree, Utxo } from "@cloak.dev/sdk-devnet";
import { PublicKey } from "@solana/web3.js";

export type CloakDepositCache = {
  signature: string;
  leafIndex: number;
  spendKeyHex: string;
  blindingHex: string;
  outputUtxos?: Utxo[] | undefined;
  // The runtime MerkleTree class is wasm-bound and intentionally never
  // persisted; the SDK refetches it on retry. Kept as an in-memory
  // optimization for the first attempt only.
  merkleTree?: MerkleTree | undefined;
  // Set to true once fullWithdraw has confirmed funds at the recipient,
  // so retries skip a duplicate withdraw and only re-run execute_with_license.
  withdrawn?: boolean | undefined;
  withdrawSignature?: string | undefined;
};

export type SerializedUtxo = {
  amount: string;
  blinding: string;
  keypairPrivateKey: string;
  keypairPublicKey: string;
  mintAddress: string;
  index?: number;
  commitment?: string;
  nullifier?: string;
  siblingCommitment?: string;
  leftSiblingCommitment?: string;
};

export type SerializedCloakDepositCache = {
  signature: string;
  leafIndex: number;
  spendKeyHex: string;
  blindingHex: string;
  outputUtxos?: SerializedUtxo[];
  withdrawn?: boolean;
  withdrawSignature?: string;
};

export function serializeUtxoForCache(u: Utxo): SerializedUtxo {
  const ext = u as Utxo & { leftSiblingCommitment?: bigint };
  return {
    amount: u.amount.toString(),
    blinding: u.blinding.toString(16),
    keypairPrivateKey: u.keypair.privateKey.toString(16),
    keypairPublicKey: u.keypair.publicKey.toString(16),
    mintAddress: u.mintAddress.toBase58(),
    ...(u.index !== undefined ? { index: u.index } : {}),
    ...(u.commitment !== undefined ? { commitment: u.commitment.toString(16) } : {}),
    ...(u.nullifier !== undefined ? { nullifier: u.nullifier.toString(16) } : {}),
    ...(u.siblingCommitment !== undefined
      ? { siblingCommitment: u.siblingCommitment.toString(16) }
      : {}),
    ...(ext.leftSiblingCommitment !== undefined
      ? { leftSiblingCommitment: ext.leftSiblingCommitment.toString(16) }
      : {}),
  };
}

export function deserializeUtxoFromCache(s: SerializedUtxo): Utxo {
  const u: Utxo & { leftSiblingCommitment?: bigint } = {
    amount: BigInt(s.amount),
    blinding: BigInt(`0x${s.blinding}`),
    keypair: {
      privateKey: BigInt(`0x${s.keypairPrivateKey}`),
      publicKey: BigInt(`0x${s.keypairPublicKey}`),
    },
    mintAddress: new PublicKey(s.mintAddress),
  };
  if (s.index !== undefined) u.index = s.index;
  if (s.commitment !== undefined) u.commitment = BigInt(`0x${s.commitment}`);
  if (s.nullifier !== undefined) u.nullifier = BigInt(`0x${s.nullifier}`);
  if (s.siblingCommitment !== undefined) u.siblingCommitment = BigInt(`0x${s.siblingCommitment}`);
  if (s.leftSiblingCommitment !== undefined) {
    u.leftSiblingCommitment = BigInt(`0x${s.leftSiblingCommitment}`);
  }
  return u;
}

export function serializeCacheEntry(value: CloakDepositCache): SerializedCloakDepositCache {
  return {
    signature: value.signature,
    leafIndex: value.leafIndex,
    spendKeyHex: value.spendKeyHex,
    blindingHex: value.blindingHex,
    ...(value.outputUtxos ? { outputUtxos: value.outputUtxos.map(serializeUtxoForCache) } : {}),
    ...(value.withdrawn !== undefined ? { withdrawn: value.withdrawn } : {}),
    ...(value.withdrawSignature !== undefined
      ? { withdrawSignature: value.withdrawSignature }
      : {}),
  };
}

export function deserializeCacheEntry(parsed: SerializedCloakDepositCache): CloakDepositCache {
  return {
    signature: parsed.signature,
    leafIndex: parsed.leafIndex,
    spendKeyHex: parsed.spendKeyHex,
    blindingHex: parsed.blindingHex,
    ...(parsed.outputUtxos
      ? { outputUtxos: parsed.outputUtxos.map(deserializeUtxoFromCache) }
      : {}),
    ...(parsed.withdrawn !== undefined ? { withdrawn: parsed.withdrawn } : {}),
    ...(parsed.withdrawSignature !== undefined
      ? { withdrawSignature: parsed.withdrawSignature }
      : {}),
  };
}

export function cloakDepositCacheKey(multisig: string, transactionIndex: string) {
  return `cloak-deposit:${multisig}:${transactionIndex}`;
}
