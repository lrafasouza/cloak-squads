import { sha256 } from "@noble/hashes/sha256";
import { blake3 } from "@noble/hashes/blake3";
import { PublicKey } from "@solana/web3.js";
import { concatBytes, u64ToLeBytes, pubkeyToBytes, domainSeparator } from "./encoding";
import type { PayloadInvariants, AuditDiversifierInput } from "./types";

export function computePayloadHash(inv: PayloadInvariants): Uint8Array {
  if (inv.nullifier.length !== 32) {
    throw new Error("nullifier must be 32 bytes");
  }
  if (inv.commitment.length !== 32) {
    throw new Error("commitment must be 32 bytes");
  }
  if (inv.recipientVkPub.length !== 32) {
    throw new Error("recipientVkPub must be 32 bytes");
  }
  if (inv.nonce.length !== 16) {
    throw new Error("nonce must be 16 bytes");
  }

  const input = concatBytes(
    domainSeparator("cloak-squads-payload-v1"),
    inv.nullifier,
    inv.commitment,
    u64ToLeBytes(inv.amount),
    pubkeyToBytes(inv.tokenMint),
    inv.recipientVkPub,
    inv.nonce,
  );
  return sha256(input);
}

export function computeAuditDiversifier(i: AuditDiversifierInput): Uint8Array {
  const input = concatBytes(
    domainSeparator("cloak-audit-v1"),
    new TextEncoder().encode(i.linkId),
    new TextEncoder().encode(i.scope),
    u64ToLeBytes(i.startDate),
    u64ToLeBytes(i.endDate),
  );
  return blake3(input).slice(0, 32);
}
