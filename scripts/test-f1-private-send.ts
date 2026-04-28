import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const { Multisig } = multisig.accounts;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEMO_FILE = path.join(__dirname, ".demo-cofre.json");

const GATEKEEPER_PROGRAM_ID = new PublicKey("AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq");

const PAYLOAD_DOMAIN_SEP = Buffer.from("cloak-squads-payload-v1\0", "utf-8");

type DemoCofre = {
  multisig: string;
  vault: string;
  cofre: string;
  creator: string;
  operator: string;
  operatorSecretKey: number[];
  createKey: number[];
  threshold: number;
};

function ixDiscriminator(name: string) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function computePayloadHash(input: {
  nullifier: Uint8Array;
  commitment: Uint8Array;
  amount: bigint;
  tokenMint: PublicKey;
  recipientVkPub: Uint8Array;
  nonce: Uint8Array;
}): Uint8Array {
  const h = createHash("sha256");
  h.update(PAYLOAD_DOMAIN_SEP);
  h.update(input.nullifier);
  h.update(input.commitment);
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(input.amount);
  h.update(amountBuf);
  h.update(input.tokenMint.toBuffer());
  h.update(input.recipientVkPub);
  h.update(input.nonce);
  return new Uint8Array(h.digest());
}

function buildIssueLicenseIx(opts: {
  cofre: PublicKey;
  license: PublicKey;
  squadsVault: PublicKey;
  payloadHash: Uint8Array;
  nonce: Uint8Array;
  ttlSecs: bigint;
}): TransactionInstruction {
  const ttlBuf = Buffer.alloc(8);
  ttlBuf.writeBigInt64LE(opts.ttlSecs);
  const data = Buffer.concat([
    ixDiscriminator("issue_license"),
    Buffer.from(opts.payloadHash),
    Buffer.from(opts.nonce),
    ttlBuf,
  ]);
  return new TransactionInstruction({
    programId: GATEKEEPER_PROGRAM_ID,
    keys: [
      { pubkey: opts.cofre, isSigner: false, isWritable: false },
      { pubkey: opts.squadsVault, isSigner: true, isWritable: false },
      { pubkey: opts.license, isSigner: false, isWritable: true },
      { pubkey: opts.squadsVault, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function buildExecuteWithLicenseIx(opts: {
  cofre: PublicKey;
  license: PublicKey;
  operator: PublicKey;
  nullifier: Uint8Array;
  commitment: Uint8Array;
  amount: bigint;
  tokenMint: PublicKey;
  recipientVkPub: Uint8Array;
  nonce: Uint8Array;
}): TransactionInstruction {
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(opts.amount);
  const data = Buffer.concat([
    ixDiscriminator("execute_with_license"),
    Buffer.from(opts.nullifier),
    Buffer.from(opts.commitment),
    amountBuf,
    opts.tokenMint.toBuffer(),
    Buffer.from(opts.recipientVkPub),
    Buffer.from(opts.nonce),
  ]);
  return new TransactionInstruction({
    programId: GATEKEEPER_PROGRAM_ID,
    keys: [
      { pubkey: opts.cofre, isSigner: false, isWritable: false },
      { pubkey: opts.license, isSigner: false, isWritable: true },
      { pubkey: opts.operator, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function confirm(connection: Connection, signature: string) {
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
}

async function main() {
  if (!fs.existsSync(DEMO_FILE)) {
    throw new Error(
      `Demo cofre not found at ${DEMO_FILE}. Run "pnpm demo:setup <operator-pubkey>" first.`,
    );
  }

  const demo: DemoCofre = JSON.parse(fs.readFileSync(DEMO_FILE, "utf-8"));
  const multisigPda = new PublicKey(demo.multisig);
  const vaultPda = new PublicKey(demo.vault);
  const cofrePda = new PublicKey(demo.cofre);
  const operator = Keypair.fromSecretKey(Uint8Array.from(demo.operatorSecretKey));

  console.log("=== F1 Private Send — Devnet Test ===");
  console.log("Multisig: ", multisigPda.toBase58());
  console.log("Vault:    ", vaultPda.toBase58());
  console.log("Cofre:    ", cofrePda.toBase58());
  console.log("Operator: ", operator.publicKey.toBase58());

  if (!demo.operatorSecretKey) {
    throw new Error(".demo-cofre.json missing operatorSecretKey. Re-run pnpm demo:setup.");
  }

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  const cofreAccount = await connection.getAccountInfo(cofrePda);
  if (!cofreAccount) {
    throw new Error(`Cofre ${cofrePda.toBase58()} not found on devnet. Re-run pnpm demo:setup.`);
  }
  if (!cofreAccount.owner.equals(GATEKEEPER_PROGRAM_ID)) {
    throw new Error(
      `Cofre owned by ${cofreAccount.owner.toBase58()}, expected ${GATEKEEPER_PROGRAM_ID.toBase58()}. Re-run pnpm demo:setup.`,
    );
  }
  const onChainOperator = new PublicKey(cofreAccount.data.subarray(40, 72));
  if (!onChainOperator.equals(operator.publicKey)) {
    throw new Error(
      `Cofre operator mismatch: on-chain ${onChainOperator.toBase58()}, script ${operator.publicKey.toBase58()}. Re-run pnpm demo:setup.`,
    );
  }
  console.log("Cofre OK  (verified on-chain)");

  const creatorKeypairEnv = process.env.SOLANA_KEYPAIR;
  if (!creatorKeypairEnv) {
    throw new Error("Set SOLANA_KEYPAIR env var to the creator keypair path.");
  }
  const creatorPath = creatorKeypairEnv.replace("~", process.env.HOME || "");
  const creator = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(creatorPath, "utf-8")) as number[]),
  );
  console.log("Creator:  ", creator.publicKey.toBase58());

  const creatorBalance = await connection.getBalance(creator.publicKey);
  console.log(`Creator balance: ${creatorBalance / LAMPORTS_PER_SOL} SOL`);
  if (creatorBalance < 0.5 * LAMPORTS_PER_SOL) {
    throw new Error("Creator needs at least 0.5 SOL");
  }

  const vaultBalance = await connection.getBalance(vaultPda);
  console.log(`Vault balance:   ${vaultBalance / LAMPORTS_PER_SOL} SOL`);
  if (vaultBalance < 0.05 * LAMPORTS_PER_SOL) {
    console.log("[preflight] Funding vault with 0.1 SOL...");
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: vaultPda,
        lamports: 100_000_000,
      }),
    );
    const fundSig = await connection.sendTransaction(fundTx, [creator], { skipPreflight: false });
    await confirm(connection, fundSig);
    console.log("  fund tx:", fundSig);
  }

  const operatorBalance = await connection.getBalance(operator.publicKey);
  console.log(`Operator balance: ${operatorBalance / LAMPORTS_PER_SOL} SOL`);
  if (operatorBalance < 0.01 * LAMPORTS_PER_SOL) {
    console.log("[preflight] Funding operator with 0.05 SOL (fees)...");
    const fundOpTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: operator.publicKey,
        lamports: 50_000_000,
      }),
    );
    const fundOpSig = await connection.sendTransaction(fundOpTx, [creator], { skipPreflight: false });
    await confirm(connection, fundOpSig);
    console.log("  fund tx:", fundOpSig);
  }

  const nullifier = randomBytes(32);
  const commitment = randomBytes(32);
  const amount = 500_000n;
  const tokenMint = Keypair.generate().publicKey;
  const recipientVkPub = randomBytes(32);
  const nonce = randomBytes(16);
  const ttlSecs = 3_600n;

  const payloadHash = computePayloadHash({
    nullifier,
    commitment,
    amount,
    tokenMint,
    recipientVkPub,
    nonce,
  });
  const [licensePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("license"), cofrePda.toBuffer(), Buffer.from(payloadHash)],
    GATEKEEPER_PROGRAM_ID,
  );

  console.log("\n--- Payload ---");
  console.log("Payload hash:", `${Buffer.from(payloadHash).toString("hex").slice(0, 16)}...`);
  console.log("License PDA: ", licensePda.toBase58());
  console.log("Amount:      ", `${Number(amount) / LAMPORTS_PER_SOL} SOL (mock)`);

  const multisigAccount = await Multisig.fromAccountAddress(connection, multisigPda);
  const transactionIndex = BigInt(multisigAccount.transactionIndex.toString()) + 1n;

  console.log(`\n[1/5] vaultTransactionCreate (issue_license) — tx index ${transactionIndex}`);

  const innerIx = buildIssueLicenseIx({
    cofre: cofrePda,
    license: licensePda,
    squadsVault: vaultPda,
    payloadHash,
    nonce,
    ttlSecs,
  });

  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: [innerIx],
  });

  const createTxSig = await multisig.rpc.vaultTransactionCreate({
    connection,
    feePayer: creator,
    multisigPda,
    transactionIndex,
    creator: creator.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    memo: "F1 test: private send",
  });
  await confirm(connection, createTxSig);
  console.log("  tx:", createTxSig);

  console.log("\n[2/5] proposalCreate...");
  const proposalSig = await multisig.rpc.proposalCreate({
    connection,
    feePayer: creator,
    creator,
    multisigPda,
    transactionIndex,
  });
  await confirm(connection, proposalSig);
  console.log("  tx:", proposalSig);

  console.log("\n[3/5] proposalApprove (threshold=1)...");
  const approveSig = await multisig.rpc.proposalApprove({
    connection,
    feePayer: creator,
    member: creator,
    multisigPda,
    transactionIndex,
  });
  await confirm(connection, approveSig);
  console.log("  tx:", approveSig);

  console.log("\n[4/5] vaultTransactionExecute (issues license)...");
  let executeSig: string;
  try {
    executeSig = await multisig.rpc.vaultTransactionExecute({
      connection,
      feePayer: creator,
      multisigPda,
      transactionIndex,
      member: creator.publicKey,
      signers: [creator],
    });
  } catch (err: unknown) {
    const errAny = err as Record<string, unknown>;
    console.error("\n  vaultTransactionExecute FAILED");
    console.error("  message:", (err as Error).message);
    if (errAny.logs) {
      console.error("  logs:");
      for (const log of errAny.logs as string[]) {
        console.error(`    ${log}`);
      }
    }
    if (errAny.simulationResponse) {
      console.error("  simulationResponse:", JSON.stringify(errAny.simulationResponse, null, 2));
    }
    throw err;
  }
  await confirm(connection, executeSig);
  console.log("  tx:", executeSig);

  const licenseAccount = await connection.getAccountInfo(licensePda);
  if (!licenseAccount) {
    throw new Error("License account not found after issue");
  }
  const licenseStatus = licenseAccount.data[104];
  console.log(
    `  License status: ${licenseStatus === 0 ? "Active" : licenseStatus === 1 ? "Consumed" : "Unknown"}`,
  );
  if (licenseStatus !== 0) {
    throw new Error(`Expected Active (0), got ${licenseStatus}`);
  }

  console.log("\n[5/5] execute_with_license (operator consumes)...");
  const executeIx = buildExecuteWithLicenseIx({
    cofre: cofrePda,
    license: licensePda,
    operator: operator.publicKey,
    nullifier,
    commitment,
    amount,
    tokenMint,
    recipientVkPub,
    nonce,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const txMessage = new TransactionMessage({
    payerKey: operator.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
      executeIx,
    ],
  }).compileToV0Message();

  const vtx = new VersionedTransaction(txMessage);
  vtx.sign([operator]);

  const consumeSig = await connection.sendTransaction(vtx, { skipPreflight: false });
  await confirm(connection, consumeSig);
  console.log("  tx:", consumeSig);

  const consumedLicense = await connection.getAccountInfo(licensePda);
  if (!consumedLicense) {
    throw new Error("License account not found after consume");
  }
  const finalStatus = consumedLicense.data[104];
  console.log(
    `  License status: ${finalStatus === 1 ? "Consumed" : `Unexpected (${finalStatus})`}`,
  );
  if (finalStatus !== 1) {
    throw new Error(`Expected Consumed (1), got ${finalStatus}`);
  }

  const onChainPayloadHash = consumedLicense.data.slice(40, 72);
  const match = Buffer.from(onChainPayloadHash).equals(Buffer.from(payloadHash));
  console.log(`  Payload hash match: ${match}`);

  console.log("\n=== F1 Private Send Test PASSED ===");
  console.log(
    JSON.stringify(
      {
        multisig: multisigPda.toBase58(),
        cofre: cofrePda.toBase58(),
        license: licensePda.toBase58(),
        payloadHash: Buffer.from(payloadHash).toString("hex"),
        licenseStatus: "Consumed",
        issueTx: executeSig,
        consumeTx: consumeSig,
        explorer: `https://explorer.solana.com/tx/${consumeSig}?cluster=devnet`,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const err = error as Error & { logs?: string[]; simulationResponse?: unknown };
  console.error("\nF1 TEST FAILED:", err.message ?? error);
  if (err.logs?.length) {
    console.error("Transaction logs:");
    for (const log of err.logs) {
      console.error(`  ${log}`);
    }
  }
  process.exit(1);
});
