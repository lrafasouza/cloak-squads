import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import bankrun from "anchor-bankrun";

type AccountInfoBytes = {
  executable: boolean;
  lamports: number;
  owner: PublicKey;
  data: Uint8Array;
  rentEpoch: number;
};

type ExecuteWithLicenseParams = {
  nullifier: Uint8Array;
  commitment: Uint8Array;
  amount: bigint;
  tokenMint: PublicKey;
  recipientVkPub: Uint8Array;
  nonce: Uint8Array;
  proofBytes: Uint8Array;
  merkleRoot: Uint8Array;
};

const { startAnchor } = bankrun;
const ROOT = path.resolve(process.cwd());
const GATEKEEPER_PROGRAM_ID = new PublicKey("WkzdQAdWRmab53mN83ayqiEc4E3gShTwgACBDkPbe4J");
const MOCK_PROGRAM_ID = new PublicKey("2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe");
const PAYLOAD_DOMAIN_SEP = Buffer.from("cloak-squads-payload-v1\0", "utf-8");

function computePayloadHash(p: {
  nullifier: Uint8Array;
  commitment: Uint8Array;
  amount: bigint;
  tokenMint: PublicKey;
  recipientVkPub: Uint8Array;
  nonce: Uint8Array;
}) {
  const h = createHash("sha256");
  h.update(PAYLOAD_DOMAIN_SEP);
  h.update(Buffer.from(p.nullifier));
  h.update(Buffer.from(p.commitment));
  h.update(encodeU64(p.amount));
  h.update(p.tokenMint.toBuffer());
  h.update(Buffer.from(p.recipientVkPub));
  h.update(Buffer.from(p.nonce));
  return new Uint8Array(h.digest());
}

function accountDiscriminator(name: string) {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

function instructionDiscriminator(name: string) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function encodePubkey(pubkey: PublicKey) {
  return pubkey.toBuffer();
}

function encodeI64(value: bigint) {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(value);
  return buf;
}

function encodeU64(value: bigint) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

function encodeU32(value: number) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value);
  return buf;
}

function accountInfo(owner: PublicKey, data: Buffer, lamports = 1_000_000): AccountInfoBytes {
  return {
    executable: false,
    lamports,
    owner,
    data: new Uint8Array(data),
    rentEpoch: 0,
  };
}

function encodeCofre({
  multisig,
  operator,
  viewKeyPublic,
  createdAt,
  version,
  revokedAudit,
  bump,
}: {
  multisig: PublicKey;
  operator: PublicKey;
  viewKeyPublic: Uint8Array;
  createdAt: bigint;
  version: number;
  revokedAudit: Uint8Array[];
  bump: number;
}) {
  const revokedEntries = Buffer.concat(revokedAudit.map((entry) => Buffer.from(entry)));
  return Buffer.concat([
    accountDiscriminator("Cofre"),
    encodePubkey(multisig),
    encodePubkey(operator),
    Buffer.from(viewKeyPublic),
    encodeI64(createdAt),
    Buffer.from([version]),
    encodeU32(revokedAudit.length),
    revokedEntries,
    Buffer.from([bump]),
  ]);
}

function encodeLicense({
  cofre,
  payloadHash,
  nonce,
  issuedAt,
  expiresAt,
  status,
  closeAuthority,
  bump,
}: {
  cofre: PublicKey;
  payloadHash: Uint8Array;
  nonce: Uint8Array;
  issuedAt: bigint;
  expiresAt: bigint;
  status: number;
  closeAuthority: PublicKey;
  bump: number;
}) {
  return Buffer.concat([
    accountDiscriminator("License"),
    encodePubkey(cofre),
    Buffer.from(payloadHash),
    Buffer.from(nonce),
    encodeI64(issuedAt),
    encodeI64(expiresAt),
    Buffer.from([status]),
    encodePubkey(closeAuthority),
    Buffer.from([bump]),
  ]);
}

function encodeStubPool({
  mint,
  merkleRootStub,
  txCount,
  bump,
}: {
  mint: PublicKey;
  merkleRootStub: Uint8Array;
  txCount: bigint;
  bump: number;
}) {
  return Buffer.concat([
    accountDiscriminator("StubPool"),
    encodePubkey(mint),
    Buffer.from(merkleRootStub),
    encodeU64(txCount),
    Buffer.from([bump]),
  ]);
}

function readU64LE(buffer: Uint8Array, offset: number) {
  return Buffer.from(buffer.slice(offset, offset + 8)).readBigUInt64LE();
}

function buildExecuteWithLicenseData(params: ExecuteWithLicenseParams) {
  return Buffer.concat([
    instructionDiscriminator("execute_with_license"),
    Buffer.from(params.nullifier),
    Buffer.from(params.commitment),
    encodeU64(params.amount),
    encodePubkey(params.tokenMint),
    Buffer.from(params.recipientVkPub),
    Buffer.from(params.nonce),
    Buffer.from(params.proofBytes),
    Buffer.from(params.merkleRoot),
  ]);
}

function buildExecuteWithLicenseIx({
  cofre,
  license,
  operator,
  cloakProgram,
  cloakPool,
  nullifierRecord,
  params,
}: {
  cofre: PublicKey;
  license: PublicKey;
  operator: PublicKey;
  cloakProgram: PublicKey;
  cloakPool: PublicKey;
  nullifierRecord: PublicKey;
  params: ExecuteWithLicenseParams;
}) {
  return new TransactionInstruction({
    programId: GATEKEEPER_PROGRAM_ID,
    keys: [
      { pubkey: cofre, isSigner: false, isWritable: false },
      { pubkey: license, isSigner: false, isWritable: true },
      { pubkey: operator, isSigner: true, isWritable: true },
      { pubkey: cloakProgram, isSigner: false, isWritable: false },
      { pubkey: cloakPool, isSigner: false, isWritable: true },
      { pubkey: nullifierRecord, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: buildExecuteWithLicenseData(params),
  });
}

async function main() {
  const context = await startAnchor(ROOT, [], []);

  const operator = Keypair.generate();
  const multisig = Keypair.generate().publicKey;
  const viewKeyPublic = new Uint8Array(32).fill(7);
  const nonce = new Uint8Array(16).fill(13);
  const nullifier = new Uint8Array(32).fill(17);
  const commitment = new Uint8Array(32).fill(19);
  const recipientVkPub = new Uint8Array(32).fill(23);
  const proofBytes = new Uint8Array(256).fill(29);
  const merkleRoot = new Uint8Array(32).fill(31);
  const tokenMint = Keypair.generate().publicKey;
  const amount = 1_000_000n;
  const payloadHash = computePayloadHash({
    nullifier,
    commitment,
    amount,
    tokenMint,
    recipientVkPub,
    nonce,
  });

  context.setAccount(operator.publicKey, {
    executable: false,
    lamports: 10n * 1_000_000_000n,
    owner: SystemProgram.programId,
    data: new Uint8Array(0),
    rentEpoch: 0,
  } as never);

  const [cofrePda, cofreBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("cofre"), multisig.toBuffer()],
    GATEKEEPER_PROGRAM_ID,
  );
  const [licensePda, licenseBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("license"), cofrePda.toBuffer(), payloadHash],
    GATEKEEPER_PROGRAM_ID,
  );
  const [poolPda, poolBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("stub_pool"), tokenMint.toBuffer()],
    MOCK_PROGRAM_ID,
  );
  const [nullifierPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("nullifier"), nullifier],
    MOCK_PROGRAM_ID,
  );

  context.setAccount(
    cofrePda,
    accountInfo(
      GATEKEEPER_PROGRAM_ID,
      encodeCofre({
        multisig,
        operator: operator.publicKey,
        viewKeyPublic,
        createdAt: 1_000_000_000n,
        version: 1,
        revokedAudit: [],
        bump: cofreBump,
      }),
    ),
  );
  const farFuture = 4_000_000_000n;
  context.setAccount(
    licensePda,
    accountInfo(
      GATEKEEPER_PROGRAM_ID,
      encodeLicense({
        cofre: cofrePda,
        payloadHash,
        nonce,
        issuedAt: 1_000_000_010n,
        expiresAt: farFuture,
        status: 0,
        closeAuthority: operator.publicKey,
        bump: licenseBump,
      }),
    ),
  );
  context.setAccount(
    poolPda,
    accountInfo(
      MOCK_PROGRAM_ID,
      encodeStubPool({
        mint: tokenMint,
        merkleRootStub: new Uint8Array(32),
        txCount: 0n,
        bump: poolBump,
      }),
    ),
  );

  const tx = new Transaction().add(
    buildExecuteWithLicenseIx({
      cofre: cofrePda,
      license: licensePda,
      operator: operator.publicKey,
      cloakProgram: MOCK_PROGRAM_ID,
      cloakPool: poolPda,
      nullifierRecord: nullifierPda,
      params: {
        nullifier,
        commitment,
        amount,
        tokenMint,
        recipientVkPub,
        nonce,
        proofBytes,
        merkleRoot,
      },
    }),
  );

  const latestBlockhash = await context.banksClient.getLatestBlockhash();
  tx.feePayer = context.payer.publicKey;
  tx.recentBlockhash = Array.isArray(latestBlockhash)
    ? latestBlockhash[0]
    : (latestBlockhash?.blockhash ?? "");
  tx.sign(context.payer, operator);

  await context.banksClient.processTransaction(tx);

  const updatedLicense = await context.banksClient.getAccount(licensePda);
  assert.ok(updatedLicense);
  assert.equal(updatedLicense.owner.toBase58(), GATEKEEPER_PROGRAM_ID.toBase58());
  assert.equal(updatedLicense.data[104], 1);

  const updatedPool = await context.banksClient.getAccount(poolPda);
  assert.ok(updatedPool);
  assert.equal(updatedPool.owner.toBase58(), MOCK_PROGRAM_ID.toBase58());
  assert.equal(readU64LE(updatedPool.data, 72), 1n);

  const nullifierAccount = await context.banksClient.getAccount(nullifierPda);
  assert.ok(nullifierAccount);
  assert.equal(nullifierAccount.owner.toBase58(), MOCK_PROGRAM_ID.toBase58());
  assert.equal(
    Buffer.from(nullifierAccount.data.slice(8, 40)).equals(Buffer.from(nullifier)),
    true,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
