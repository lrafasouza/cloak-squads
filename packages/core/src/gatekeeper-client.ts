import type { Program, BN } from "@coral-xyz/anchor";
import type { Instruction, PublicKey } from "@solana/web3.js";
import { computePayloadHash, u64ToLeBytes, encodeArray, encodePubkey } from "./encoding";
import type { PayloadInvariants } from "./types";

export function buildIssueLicenseIx(
  program: Program,
  cofre: PublicKey,
  invariants: PayloadInvariants,
  nonce: Uint8Array,
  ttlSecs: number,
  payer: PublicKey,
): Instruction {
  const payloadHash = computePayloadHash(invariants);

  return program.methods.issueLicense(
    Array.from(payloadHash),
    Array.from(nonce),
    ttlSecs,
  ).accountsPartial({
    cofre,
    payer,
  }).instruction();
}

export function buildExecuteWithLicenseIx(
  program: Program,
  cofre: PublicKey,
  license: PublicKey,
  operator: PublicKey,
  invariants: PayloadInvariants,
  proofBytes: Uint8Array,
  merkleRoot: Uint8Array,
  cloakProgram: PublicKey,
  pool: PublicKey,
  nullifierRecord: PublicKey,
): Instruction {
  return program.methods.executeWithLicense(
    {
      nullifier: Array.from(invariants.nullifier),
      commitment: Array.from(invariants.commitment),
      amount: new BN(invariants.amount.toString()),
      tokenMint: invariants.tokenMint,
      recipientVkPub: Array.from(invariants.recipientVkPub),
      nonce: Array.from(invariants.nonce),
    },
    Array.from(proofBytes),
    Array.from(merkleRoot),
  ).accountsPartial({
    cofre,
    license,
    operator,
    cloakProgram,
    pool,
    nullifierRecord,
  }).instruction();
}
