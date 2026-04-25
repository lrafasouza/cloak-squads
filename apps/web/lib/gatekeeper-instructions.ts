"use client";

// biome-ignore lint/style/useNodejsImportProtocol: Client bundle uses the buffer package polyfill.
import { Buffer } from "buffer";
import { cofrePda, licensePda, squadsVaultPda } from "@cloak-squads/core/pda";
import type { PayloadInvariants } from "@cloak-squads/core/types";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { publicEnv } from "./env";

function writeI64Le(value: bigint) {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigInt64(0, value, true);
  return out;
}

function writeU64Le(value: bigint) {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, true);
  return out;
}

function concatBytes(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function anchorDiscriminator(name: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`global:${name}`));
  return new Uint8Array(digest).slice(0, 8);
}

export async function buildIssueLicenseIxBrowser(params: {
  multisig: PublicKey;
  payloadHash: Uint8Array;
  nonce: Uint8Array;
  ttlSecs?: number;
}) {
  const gatekeeperProgram = new PublicKey(publicEnv.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID);
  const cofre = cofrePda(params.multisig)[0];
  const vault = squadsVaultPda(params.multisig)[0];
  const license = licensePda(cofre, params.payloadHash)[0];
  const discriminator = await anchorDiscriminator("issue_license");
  const data = concatBytes(
    discriminator,
    params.payloadHash,
    params.nonce,
    writeI64Le(BigInt(params.ttlSecs ?? 900)),
  );

  return {
    cofre,
    vault,
    license,
    instruction: new TransactionInstruction({
      programId: gatekeeperProgram,
      keys: [
        { pubkey: cofre, isSigner: false, isWritable: false },
        { pubkey: vault, isSigner: true, isWritable: false },
        { pubkey: license, isSigner: false, isWritable: true },
        { pubkey: vault, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(data),
    }),
  };
}

export async function buildExecuteWithLicenseIxBrowser(params: {
  multisig: PublicKey;
  operator: PublicKey;
  invariants: PayloadInvariants;
  proofBytes: Uint8Array;
  merkleRoot: Uint8Array;
  cloakProgram: PublicKey;
  pool: PublicKey;
  nullifierRecord: PublicKey;
}) {
  const gatekeeperProgram = new PublicKey(publicEnv.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID);
  const cofre = cofrePda(params.multisig)[0];
  const payloadHash = await crypto.subtle.digest(
    "SHA-256",
    concatBytes(
      new TextEncoder().encode("cloak-squads-payload-v1\0"),
      params.invariants.nullifier,
      params.invariants.commitment,
      writeU64Le(params.invariants.amount),
      params.invariants.tokenMint.toBytes(),
      params.invariants.recipientVkPub,
      params.invariants.nonce,
    ),
  );
  const license = licensePda(cofre, new Uint8Array(payloadHash))[0];
  const discriminator = await anchorDiscriminator("execute_with_license");
  const data = concatBytes(
    discriminator,
    params.invariants.nullifier,
    params.invariants.commitment,
    writeU64Le(params.invariants.amount),
    params.invariants.tokenMint.toBytes(),
    params.invariants.recipientVkPub,
    params.invariants.nonce,
    params.proofBytes,
    params.merkleRoot,
  );

  return new TransactionInstruction({
    programId: gatekeeperProgram,
    keys: [
      { pubkey: cofre, isSigner: false, isWritable: false },
      { pubkey: license, isSigner: false, isWritable: true },
      { pubkey: params.operator, isSigner: true, isWritable: false },
      { pubkey: params.cloakProgram, isSigner: false, isWritable: false },
      { pubkey: params.pool, isSigner: false, isWritable: true },
      { pubkey: params.nullifierRecord, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}
