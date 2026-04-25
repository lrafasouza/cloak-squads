import { BN, type Program } from "@coral-xyz/anchor";
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { computePayloadHash } from "./hashing";
import type { PayloadInvariants } from "./types";

export function buildIssueLicenseIx(
  program: Program,
  cofre: PublicKey,
  invariants: PayloadInvariants,
  nonce: Uint8Array,
  ttlSecs: number,
  payer: PublicKey,
): Promise<TransactionInstruction> {
  const payloadHash = computePayloadHash(invariants);
  const issueLicense = program.methods.issueLicense;
  if (!issueLicense) {
    throw new Error("IDL is missing issueLicense");
  }

  return issueLicense(Array.from(payloadHash), Array.from(nonce), ttlSecs)
    .accountsPartial({
      cofre,
      payer,
    })
    .instruction();
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
): Promise<TransactionInstruction> {
  const executeWithLicense = program.methods.executeWithLicense;
  if (!executeWithLicense) {
    throw new Error("IDL is missing executeWithLicense");
  }

  return executeWithLicense(
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
  )
    .accountsPartial({
      cofre,
      license,
      operator,
      cloakProgram,
      pool,
      nullifierRecord,
    })
    .instruction();
}
