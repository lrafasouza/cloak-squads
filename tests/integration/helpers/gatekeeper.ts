import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  type Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";

export type AccountInfoBytes = {
  executable: boolean;
  lamports: number | bigint;
  owner: PublicKey;
  data: Uint8Array;
  rentEpoch: number | bigint;
};

export type BankrunContext = {
  banksClient: {
    getAccount(address: PublicKey): Promise<AccountInfoBytes | null>;
    getBalance(address: PublicKey): Promise<bigint>;
    getLatestBlockhash(): Promise<[string, bigint] | { blockhash: string } | null>;
    processTransaction(tx: Transaction): Promise<unknown>;
    tryProcessTransaction(tx: Transaction): Promise<{
      result: string | null;
      meta: { logMessages: string[] } | null;
    }>;
  };
  payer: Keypair;
  setAccount(address: PublicKey, account: AccountInfoBytes): void;
};

export const GATEKEEPER_PROGRAM_ID = new PublicKey("WkzdQAdWRmab53mN83ayqiEc4E3gShTwgACBDkPbe4J");
export const MOCK_PROGRAM_ID = new PublicKey("2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe");
export const SQUADS_HARNESS_PROGRAM_ID = new PublicKey(
  "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
);
export const PAYLOAD_DOMAIN_SEP = Buffer.from("cloak-squads-payload-v1\0", "utf-8");

export const COFRE_SPACE = (revokedCount: number) =>
  8 + 32 + 32 + 32 + 8 + 1 + 4 + 16 * revokedCount + 1;
export const VIEW_DIST_SPACE = (entries: number) => 8 + 32 + 4 + entries * 144 + 1;
export const LICENSE_SPACE = 8 + 32 + 32 + 16 + 8 + 8 + 1 + 32 + 1;
export const MAX_REVOKED = 256;

export type PayloadInvariants = {
  nullifier: Uint8Array;
  commitment: Uint8Array;
  amount: bigint;
  tokenMint: PublicKey;
  recipientVkPub: Uint8Array;
  nonce: Uint8Array;
};

export function sha256(data: Buffer | string) {
  return createHash("sha256").update(data).digest();
}

export function accountDiscriminator(name: string) {
  return sha256(`account:${name}`).subarray(0, 8);
}

export function instructionDiscriminator(name: string) {
  return sha256(`global:${name}`).subarray(0, 8);
}

export function encodeU32(value: number) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value);
  return buf;
}

export function encodeI64(value: bigint) {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(value);
  return buf;
}

export function encodeU64(value: bigint) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

export function encodePubkey(pubkey: PublicKey) {
  return pubkey.toBuffer();
}

export function encodeArray(bytes: Uint8Array, length: number, label: string) {
  assert.equal(bytes.length, length, `${label} must be ${length} bytes`);
  return Buffer.from(bytes);
}

export function encodeCofre(input: {
  multisig: PublicKey;
  operator: PublicKey;
  viewKeyPublic: Uint8Array;
  createdAt: bigint;
  version: number;
  revokedAudit: Uint8Array[];
  bump: number;
}) {
  return Buffer.concat([
    accountDiscriminator("Cofre"),
    encodePubkey(input.multisig),
    encodePubkey(input.operator),
    encodeArray(input.viewKeyPublic, 32, "viewKeyPublic"),
    encodeI64(input.createdAt),
    Buffer.from([input.version]),
    encodeU32(input.revokedAudit.length),
    ...input.revokedAudit.map((entry) => encodeArray(entry, 16, "revokedAudit entry")),
    Buffer.from([input.bump]),
  ]);
}

export function encodeLicense(input: {
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
    encodePubkey(input.cofre),
    encodeArray(input.payloadHash, 32, "payloadHash"),
    encodeArray(input.nonce, 16, "nonce"),
    encodeI64(input.issuedAt),
    encodeI64(input.expiresAt),
    Buffer.from([input.status]),
    encodePubkey(input.closeAuthority),
    Buffer.from([input.bump]),
  ]);
}

export function encodeStubPool(input: {
  mint: PublicKey;
  merkleRootStub: Uint8Array;
  txCount: bigint;
  bump: number;
}) {
  return Buffer.concat([
    accountDiscriminator("StubPool"),
    encodePubkey(input.mint),
    encodeArray(input.merkleRootStub, 32, "merkleRootStub"),
    encodeU64(input.txCount),
    Buffer.from([input.bump]),
  ]);
}

export function readPubkey(data: Uint8Array, offset: number) {
  return new PublicKey(data.slice(offset, offset + 32));
}

export function readI64(data: Uint8Array, offset: number) {
  return Buffer.from(data.slice(offset, offset + 8)).readBigInt64LE();
}

export function readU64(data: Uint8Array, offset: number) {
  return Buffer.from(data.slice(offset, offset + 8)).readBigUInt64LE();
}

export function assertOwner(account: AccountInfoBytes, owner: PublicKey) {
  assert.equal(account.owner.toBase58(), owner.toBase58());
}

export function assertDiscriminator(data: Uint8Array, name: string) {
  assert.equal(
    Buffer.from(data.slice(0, 8)).equals(accountDiscriminator(name)),
    true,
    `invalid discriminator for ${name}`,
  );
}

export function decodeCofre(account: AccountInfoBytes) {
  assertOwner(account, GATEKEEPER_PROGRAM_ID);
  assertDiscriminator(account.data, "Cofre");
  const revokedLen = Buffer.from(account.data.slice(113, 117)).readUInt32LE();
  assert.equal(account.data.length, COFRE_SPACE(revokedLen));
  const revokedAudit = Array.from({ length: revokedLen }, (_, index) =>
    account.data.slice(117 + index * 16, 117 + (index + 1) * 16),
  );
  return {
    multisig: readPubkey(account.data, 8),
    operator: readPubkey(account.data, 40),
    viewKeyPublic: account.data.slice(72, 104),
    createdAt: readI64(account.data, 104),
    version: account.data[112],
    revokedAudit,
    bump: account.data[117 + revokedLen * 16],
  };
}

export function decodeLicense(account: AccountInfoBytes) {
  assertOwner(account, GATEKEEPER_PROGRAM_ID);
  assertDiscriminator(account.data, "License");
  assert.equal(account.data.length, LICENSE_SPACE);
  return {
    cofre: readPubkey(account.data, 8),
    payloadHash: account.data.slice(40, 72),
    nonce: account.data.slice(72, 88),
    issuedAt: readI64(account.data, 88),
    expiresAt: readI64(account.data, 96),
    status: account.data[104],
    closeAuthority: readPubkey(account.data, 105),
    bump: account.data[137],
  };
}

export function decodeViewDistribution(account: AccountInfoBytes) {
  assertOwner(account, GATEKEEPER_PROGRAM_ID);
  assertDiscriminator(account.data, "ViewKeyDistribution");
  const entriesLen = Buffer.from(account.data.slice(40, 44)).readUInt32LE();
  assert.equal(account.data.length, VIEW_DIST_SPACE(entriesLen));
  const entries = Array.from({ length: entriesLen }, (_, index) => {
    const base = 44 + index * 144;
    return {
      signer: readPubkey(account.data, base),
      ephemeralPk: account.data.slice(base + 32, base + 64),
      nonce: account.data.slice(base + 64, base + 88),
      ciphertext: account.data.slice(base + 88, base + 136),
      addedAt: readI64(account.data, base + 136),
    };
  });
  return {
    cofre: readPubkey(account.data, 8),
    entries,
    bump: account.data[44 + entriesLen * 144],
  };
}

export function decodeStubPool(account: AccountInfoBytes) {
  assertOwner(account, MOCK_PROGRAM_ID);
  assertDiscriminator(account.data, "StubPool");
  return {
    mint: readPubkey(account.data, 8),
    merkleRootStub: account.data.slice(40, 72),
    txCount: readU64(account.data, 72),
    bump: account.data[80],
  };
}

export function cofrePda(multisig: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("cofre"), multisig.toBuffer()],
    GATEKEEPER_PROGRAM_ID,
  );
}

export function licensePda(cofre: PublicKey, payloadHash: Uint8Array) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("license"), cofre.toBuffer(), Buffer.from(payloadHash)],
    GATEKEEPER_PROGRAM_ID,
  );
}

export function viewDistributionPda(cofre: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("view_dist"), cofre.toBuffer()],
    GATEKEEPER_PROGRAM_ID,
  );
}

export function squadsVaultPda(multisig: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("multisig"), multisig.toBuffer(), Buffer.from("vault"), Buffer.from([0])],
    SQUADS_HARNESS_PROGRAM_ID,
  );
}

export function poolPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stub_pool"), mint.toBuffer()],
    MOCK_PROGRAM_ID,
  );
}

export function nullifierPda(nullifier: Uint8Array) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("nullifier"), Buffer.from(nullifier)],
    MOCK_PROGRAM_ID,
  );
}

export function computePayloadHash(input: PayloadInvariants) {
  const h = createHash("sha256");
  h.update(PAYLOAD_DOMAIN_SEP);
  h.update(Buffer.from(input.nullifier));
  h.update(Buffer.from(input.commitment));
  h.update(encodeU64(input.amount));
  h.update(input.tokenMint.toBuffer());
  h.update(Buffer.from(input.recipientVkPub));
  h.update(Buffer.from(input.nonce));
  return new Uint8Array(h.digest());
}

export function buildIxData(name: string, fields: Buffer[]) {
  return Buffer.concat([instructionDiscriminator(name), ...fields]);
}

export async function latestBlockhash(context: BankrunContext) {
  const latest = await context.banksClient.getLatestBlockhash();
  assert.ok(latest, "latest blockhash should exist");
  return Array.isArray(latest) ? latest[0] : latest.blockhash;
}

export async function processTx(
  context: BankrunContext,
  ixs: TransactionInstruction[],
  signers: Keypair[] = [],
) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = context.payer.publicKey;
  tx.recentBlockhash = await latestBlockhash(context);
  tx.sign(context.payer, ...signers);
  return context.banksClient.processTransaction(tx);
}

export async function expectTxFailure(
  context: BankrunContext,
  ixs: TransactionInstruction[],
  expected: string,
  signers: Keypair[] = [],
) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = context.payer.publicKey;
  tx.recentBlockhash = await latestBlockhash(context);
  tx.sign(context.payer, ...signers);
  const result = await context.banksClient.tryProcessTransaction(tx);
  const haystack = `${result.result ?? ""}\n${result.meta?.logMessages.join("\n") ?? ""}`;
  assert.notEqual(result.result, null, "transaction should fail");
  assert.match(haystack, new RegExp(expected));
}

export function accountInfo(owner: PublicKey, data: Buffer, lamports = 10_000_000n) {
  return {
    executable: false,
    lamports,
    owner,
    data: new Uint8Array(data),
    rentEpoch: 0,
  } satisfies AccountInfoBytes;
}

export function fundedSystemAccount(lamports = 10n * 1_000_000_000n) {
  return {
    executable: false,
    lamports,
    owner: SystemProgram.programId,
    data: new Uint8Array(0),
    rentEpoch: 0,
  } satisfies AccountInfoBytes;
}
