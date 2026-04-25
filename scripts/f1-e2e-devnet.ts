/**
 * F1 End-to-End Test on Devnet (Threshold 1)
 *
 * Prerequisites:
 * 1. cloak-mock deployed to devnet
 * 2. Gatekeeper deployed to devnet
 * 3. Wallet with at least 0.5 SOL
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const { Permission, Permissions } = multisig.types;
const { Multisig, ProgramConfig } = multisig.accounts;

const GATEKEEPER_PROGRAM_ID = new PublicKey("WkzdQAdWRmab53mN83ayqiEc4E3gShTwgACBDkPbe4J");
const MOCK_PROGRAM_ID = new PublicKey("2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe");

function loadKeypair(filePath = path.join(os.homedir(), ".config/solana/id.json")) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Keypair not found at ${filePath}. Set SOLANA_KEYPAIR env var.`);
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf-8")) as number[]),
  );
}

async function confirm(connection: Connection, signature: string): Promise<void> {
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    "confirmed",
  );
  console.log(`  ✓ Confirmed: ${signature}`);
}

function ixDiscriminator(name: string): Buffer {
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function buildInitPoolIx(opts: {
  pool: PublicKey;
  payer: PublicKey;
  mint: PublicKey;
}): TransactionInstruction {
  const data = Buffer.concat([ixDiscriminator("init_pool"), opts.mint.toBuffer()]);
  return new TransactionInstruction({
    programId: MOCK_PROGRAM_ID,
    keys: [
      { pubkey: opts.pool, isSigner: false, isWritable: true },
      { pubkey: opts.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function buildInitCofreIx(opts: {
  cofre: PublicKey;
  vaultPda: PublicKey;
  multisig: PublicKey;
  operator: PublicKey;
  viewKeyPublic: Uint8Array;
}): TransactionInstruction {
  const data = Buffer.concat([
    ixDiscriminator("init_cofre"),
    opts.multisig.toBuffer(),
    opts.operator.toBuffer(),
    Buffer.from(opts.viewKeyPublic),
  ]);
  return new TransactionInstruction({
    programId: GATEKEEPER_PROGRAM_ID,
    keys: [
      { pubkey: opts.cofre, isSigner: false, isWritable: true },
      { pubkey: opts.vaultPda, isSigner: true, isWritable: false },
      { pubkey: opts.vaultPda, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function buildIssueLicenseIx(opts: {
  cofre: PublicKey;
  license: PublicKey;
  vaultPda: PublicKey;
  payer: PublicKey;
  payloadHash: Uint8Array;
  nonce: Uint8Array;
  ttlSecs: number;
}): TransactionInstruction {
  const ttlBuffer = Buffer.alloc(8);
  ttlBuffer.writeBigInt64LE(BigInt(opts.ttlSecs));

  const data = Buffer.concat([
    ixDiscriminator("issue_license"),
    Buffer.from(opts.payloadHash),
    Buffer.from(opts.nonce),
    ttlBuffer,
  ]);

  return new TransactionInstruction({
    programId: GATEKEEPER_PROGRAM_ID,
    keys: [
      { pubkey: opts.cofre, isSigner: false, isWritable: false },
      { pubkey: opts.vaultPda, isSigner: true, isWritable: false },
      { pubkey: opts.license, isSigner: false, isWritable: true },
      { pubkey: opts.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function buildExecuteWithLicenseIx(opts: {
  cofre: PublicKey;
  license: PublicKey;
  operator: PublicKey;
  cloakPool: PublicKey;
  nullifierRecord: PublicKey;
  params: {
    nullifier: Uint8Array;
    commitment: Uint8Array;
    amount: bigint;
    tokenMint: PublicKey;
    recipientVkPub: Uint8Array;
    nonce: Uint8Array;
  };
  proofBytes: Uint8Array;
  merkleRoot: Uint8Array;
}): TransactionInstruction {
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUint64LE(opts.params.amount);

  const data = Buffer.concat([
    ixDiscriminator("execute_with_license"),
    Buffer.from(opts.params.nullifier),
    Buffer.from(opts.params.commitment),
    amountBuffer,
    opts.params.tokenMint.toBuffer(),
    Buffer.from(opts.params.recipientVkPub),
    Buffer.from(opts.params.nonce),
    Buffer.from(opts.proofBytes),
    Buffer.from(opts.merkleRoot),
  ]);

  return new TransactionInstruction({
    programId: GATEKEEPER_PROGRAM_ID,
    keys: [
      { pubkey: opts.cofre, isSigner: false, isWritable: false },
      { pubkey: opts.license, isSigner: false, isWritable: true },
      { pubkey: opts.operator, isSigner: true, isWritable: true },
      { pubkey: MOCK_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: opts.cloakPool, isSigner: false, isWritable: true },
      { pubkey: opts.nullifierRecord, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const creator = loadKeypair(process.env.SOLANA_KEYPAIR);
  const operator = Keypair.generate();

  // Create new multisig with threshold 1
  const createKey = Keypair.generate();
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
  const [cofrePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("cofre"), multisigPda.toBuffer()],
    GATEKEEPER_PROGRAM_ID,
  );

  console.log("=== F1 E2E Test (Threshold 1) ===");
  console.log("Creator:     ", creator.publicKey.toBase58());
  console.log("Operator:     ", operator.publicKey.toBase58());
  console.log("Multisig PDA: ", multisigPda.toBase58());
  console.log("Vault PDA:    ", vaultPda.toBase58());
  console.log("Cofre PDA:    ", cofrePda.toBase58());
  console.log("");

  // Fund operator
  console.log("1. Funding operator...");
  const fundSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: operator.publicKey,
        lamports: 0.1 * LAMPORTS_PER_SOL,
      }),
    ),
    [creator],
    { commitment: "confirmed" },
  );
  await confirm(connection, fundSig);

  // Create multisig with threshold 1
  console.log("2. Creating multisig (threshold 1)...");
  const [programConfigPda] = multisig.getProgramConfigPda({});
  const programConfig = await ProgramConfig.fromAccountAddress(connection, programConfigPda);
  const treasury = programConfig.treasury;

  const memberPermissions = Permissions.fromPermissions([
    Permission.Initiate,
    Permission.Vote,
    Permission.Execute,
  ]);

  const createSig = await multisig.rpc.multisigCreateV2({
    connection,
    treasury,
    createKey,
    creator,
    multisigPda,
    configAuthority: null,
    threshold: 1, // Only 1 approval needed!
    members: [
      { key: creator.publicKey, permissions: memberPermissions },
    ],
    timeLock: 0,
    rentCollector: null,
    memo: "F1 test - threshold 1",
  });
  await confirm(connection, createSig);

  // Fund vault
  console.log("3. Funding vault...");
  const fundVaultSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: vaultPda,
        lamports: 20_000_000,
      }),
    ),
    [creator],
    { commitment: "confirmed" },
  );
  await confirm(connection, fundVaultSig);

  // Check/create mock pool
  console.log("4. Setting up mock pool...");
  const mint = SystemProgram.programId;
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("stub_pool"), mint.toBuffer()],
    MOCK_PROGRAM_ID,
  );

  const poolExists = await connection.getAccountInfo(poolPda);
  if (!poolExists) {
    const initPoolTx = new Transaction().add(
      buildInitPoolIx({ pool: poolPda, payer: creator.publicKey, mint }),
    );
    const poolSig = await sendAndConfirmTransaction(connection, initPoolTx, [creator], { commitment: "confirmed" });
    await confirm(connection, poolSig);
  } else {
    console.log("  ✓ Pool exists");
  }

  // Initialize cofre
  console.log("5. Initializing cofre...");
  const multisigAccount = await Multisig.fromAccountAddress(connection, multisigPda);
  const currentTxIndex = BigInt(multisigAccount.transactionIndex.toString());
  const txIndex = currentTxIndex + 1n;

  console.log(`   Current txIndex: ${currentTxIndex}, using: ${txIndex}`);

  const viewKeyPublic = new Uint8Array(32).fill(0xaa);
  const initCofreIx = buildInitCofreIx({
    cofre: cofrePda,
    vaultPda,
    multisig: multisigPda,
    operator: operator.publicKey,
    viewKeyPublic,
  });

  const initCofreMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: [initCofreIx],
  });

  const initCreateSig = await multisig.rpc.vaultTransactionCreate({
    connection,
    feePayer: creator,
    multisigPda,
    transactionIndex: txIndex,
    creator: creator.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: initCofreMessage,
    memo: "Init cofre",
  });
  await confirm(connection, initCreateSig);

  const initProposalSig = await multisig.rpc.proposalCreate({
    connection,
    feePayer: creator,
    creator,
    multisigPda,
    transactionIndex: txIndex,
  });
  await confirm(connection, initProposalSig);

  const initApproveSig = await multisig.rpc.proposalApprove({
    connection,
    feePayer: creator,
    member: creator,
    multisigPda,
    transactionIndex: txIndex,
  });
  await confirm(connection, initApproveSig);

  const initExecuteSig = await multisig.rpc.vaultTransactionExecute({
    connection,
    feePayer: creator,
    multisigPda,
    transactionIndex: txIndex,
    member: creator.publicKey,
    signers: [creator],
  });
  await confirm(connection, initExecuteSig);

  // Create license proposal
  console.log("6. Creating license proposal...");
  const { createHash } = require("node:crypto");

  const nullifier = Keypair.generate().publicKey.toBytes();
  const commitment = Keypair.generate().publicKey.toBytes();
  const recipientVkPub = Keypair.generate().publicKey.toBytes();
  const nonce = new Uint8Array(16).fill(0x42);
  const amount = 1_000_000_000n;
  const tokenMint = SystemProgram.programId;

  const amountLeBytes = Buffer.alloc(8);
  amountLeBytes.writeBigUInt64LE(amount);

  const payloadHash = createHash("sha256")
    .update(Buffer.concat([
      Buffer.from("cloak-squads-payload-v1\0"),
      nullifier,
      commitment,
      amountLeBytes,
      tokenMint.toBuffer(),
      recipientVkPub,
      nonce,
    ]))
    .digest();

  const [licensePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("license"), cofrePda.toBuffer(), payloadHash],
    GATEKEEPER_PROGRAM_ID,
  );

  const issueLicenseIx = buildIssueLicenseIx({
    cofre: cofrePda,
    license: licensePda,
    vaultPda,
    payer: vaultPda,
    payloadHash,
    nonce,
    ttlSecs: 900,
  });

  const licenseMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: [issueLicenseIx],
  });

  // Wait a bit for chain to update
  await new Promise(resolve => setTimeout(resolve, 1000));

  const updatedMultisig = await Multisig.fromAccountAddress(connection, multisigPda);
  const currentLicenseTxIndex = BigInt(updatedMultisig.transactionIndex.toString());
  const licenseTxIndex = currentLicenseTxIndex + 1n;

  console.log(`   Current txIndex for license: ${currentLicenseTxIndex}, using: ${licenseTxIndex}`);

  const licenseCreateSig = await multisig.rpc.vaultTransactionCreate({
    connection,
    feePayer: creator,
    multisigPda,
    transactionIndex: licenseTxIndex,
    creator: creator.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: licenseMessage,
    memo: "F1 license",
  });
  await confirm(connection, licenseCreateSig);

  const licenseProposalSig = await multisig.rpc.proposalCreate({
    connection,
    feePayer: creator,
    creator,
    multisigPda,
    transactionIndex: licenseTxIndex,
  });
  await confirm(connection, licenseProposalSig);

  const licenseApproveSig = await multisig.rpc.proposalApprove({
    connection,
    feePayer: creator,
    member: creator,
    multisigPda,
    transactionIndex: licenseTxIndex,
  });
  await confirm(connection, licenseApproveSig);

  console.log("7. Executing vault transaction (creates License)...");
  const licenseExecuteSig = await multisig.rpc.vaultTransactionExecute({
    connection,
    feePayer: creator,
    multisigPda,
    transactionIndex: licenseTxIndex,
    member: creator.publicKey,
    signers: [creator],
  });
  await confirm(connection, licenseExecuteSig);

  // Operator executes with license
  console.log("8. Operator executing with license...");
  const [nullifierRecordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("nullifier"), nullifier],
    MOCK_PROGRAM_ID,
  );

  const executeIx = buildExecuteWithLicenseIx({
    cofre: cofrePda,
    license: licensePda,
    operator: operator.publicKey,
    cloakPool: poolPda,
    nullifierRecord: nullifierRecordPda,
    params: {
      nullifier,
      commitment,
      amount,
      tokenMint,
      recipientVkPub,
      nonce,
    },
    proofBytes: new Uint8Array(256).fill(0),
    merkleRoot: new Uint8Array(32).fill(0),
  });

  const executeSig = await sendAndConfirmTransaction(connection, new Transaction().add(executeIx), [operator], { commitment: "confirmed" });
  await confirm(connection, executeSig);

  // Verify
  console.log("9. Verifying results...");
  const licenseAccount = await connection.getAccountInfo(licensePda);
  if (licenseAccount) {
    const status = licenseAccount.data[104];
    console.log(`  License status: ${status === 1 ? "Consumed ✓" : "Active"}`);
  }

  const poolAccount = await connection.getAccountInfo(poolPda);
  if (poolAccount) {
    const txCount = Buffer.from(poolAccount.data.subarray(72, 80)).readBigUInt64LE(0);
    console.log(`  Pool tx_count: ${txCount}`);
  }

  console.log("\n=== F1 E2E Complete (Threshold 1) ===");
  console.log("✓ All steps passed with only 1 approval needed!");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
