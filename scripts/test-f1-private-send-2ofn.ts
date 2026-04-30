/**
 * F1 Private Send — Devnet Test (2-of-N variant).
 *
 * Runs the full F1 flow against a multisig created by setup-demo-cofre-2ofn.ts,
 * including multi-member Squads approvals and operator execution.
 *
 * Usage:
 *   pnpm tsx scripts/test-f1-private-send-2ofn.ts <recipient-pubkey> <amount-in-sol>
 *
 * Requires:
 *   - .demo-cofre-2ofn.json produced by setup-demo-cofre-2ofn.ts
 *   - SOLANA_KEYPAIR env var (creator wallet, used for funding + first approval)
 *   - OPERATOR_KEYPAIR env var (operator wallet, does Cloak deposit + withdraw)
 */

import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLOAK_PROGRAM_ID,
  NATIVE_SOL_MINT,
  calculateFeeBigint,
  computeUtxoCommitment,
  createUtxo,
  createZeroUtxo,
  fullWithdraw,
  generateUtxoKeypair,
  transact,
} from "@cloak.dev/sdk-devnet";
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
const DEMO_FILE = path.join(__dirname, ".demo-cofre-2ofn.json");

const GATEKEEPER_PROGRAM_ID = new PublicKey("AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq");

const PAYLOAD_DOMAIN_SEP = Buffer.from("cloak-squads-payload-v1\0", "utf-8");

type DemoCofre2ofN = {
  multisig: string;
  vault: string;
  cofre: string;
  creator: string;
  operator: string;
  createKey: number[];
  threshold: number;
  numMembers: number;
  memberSecrets: number[][];
  setupTx: string;
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

function readArgs(): { recipient: PublicKey; amountSol: number } {
  const recipientArg = process.argv[2];
  const amountArg = process.argv[3];
  if (!recipientArg || !amountArg) {
    throw new Error("Usage: pnpm tsx scripts/test-f1-private-send-2ofn.ts <recipient-pubkey> <amount-in-sol>");
  }
  let recipient: PublicKey;
  try {
    recipient = new PublicKey(recipientArg);
  } catch {
    throw new Error(`Invalid recipient pubkey: ${recipientArg}`);
  }
  const amountSol = Number.parseFloat(amountArg);
  if (Number.isNaN(amountSol) || amountSol <= 0) {
    throw new Error(`Invalid amount: ${amountArg}`);
  }
  return { recipient, amountSol };
}

function loadKeypair(filePath?: string) {
  const candidates = filePath
    ? [filePath.replace("~", process.env.HOME || os.homedir())]
    : [
        path.join(os.homedir(), ".config/solana/id.json"),
        path.join(os.homedir(), ".config/solana/cloak-devnet.json"),
      ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf-8")) as number[]),
      );
    }
  }
  throw new Error(
    `Keypair not found at ${candidates.join(" or ")}. Set SOLANA_KEYPAIR env var or run node scripts/import-phantom-key.mjs first.`,
  );
}

async function main() {
  const { recipient, amountSol } = readArgs();
  const amount = BigInt(Math.ceil(amountSol * LAMPORTS_PER_SOL));

  if (!fs.existsSync(DEMO_FILE)) {
    throw new Error(
      `Demo cofre not found at ${DEMO_FILE}. Run "pnpm tsx scripts/setup-demo-cofre-2ofn.ts <threshold> <num-members> <operator-pubkey>" first.`,
    );
  }

  const demo: DemoCofre2ofN = JSON.parse(fs.readFileSync(DEMO_FILE, "utf-8"));
  const multisigPda = new PublicKey(demo.multisig);
  const vaultPda = new PublicKey(demo.vault);
  const cofrePda = new PublicKey(demo.cofre);

  // Reconstruct member keypairs from saved secrets
  const creator = loadKeypair(process.env.SOLANA_KEYPAIR);
  if (creator.publicKey.toBase58() !== demo.creator) {
    throw new Error(
      `SOLANA_KEYPAIR wallet (${creator.publicKey.toBase58()}) does not match demo creator (${demo.creator})`,
    );
  }

  const extraMembers: Keypair[] = [];
  for (const secret of demo.memberSecrets) {
    extraMembers.push(Keypair.fromSecretKey(Uint8Array.from(secret)));
  }
  const allMembers = [creator, ...extraMembers];

  const operatorKeypairEnv = process.env.OPERATOR_KEYPAIR;
  const operator = loadKeypair(operatorKeypairEnv);
  if (operator.publicKey.toBase58() !== demo.operator) {
    console.warn(
      `WARNING: operator wallet (${operator.publicKey.toBase58()}) does not match demo operator (${demo.operator}).`,
    );
  }

  console.log(`=== F1 Private Send — Devnet Test (${demo.threshold}-of-${demo.numMembers}) ===`);
  console.log("Multisig: ", multisigPda.toBase58());
  console.log("Vault:    ", vaultPda.toBase58());
  console.log("Cofre:    ", cofrePda.toBase58());
  console.log("Operator: ", operator.publicKey.toBase58());
  console.log("Members:  ", allMembers.map((m) => m.publicKey.toBase58().slice(0, 8) + "...").join(", "));

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  const cofreAccount = await connection.getAccountInfo(cofrePda);
  if (!cofreAccount) {
    throw new Error(`Cofre ${cofrePda.toBase58()} not found on devnet. Re-run setup.`);
  }
  if (!cofreAccount.owner.equals(GATEKEEPER_PROGRAM_ID)) {
    throw new Error(
      `Cofre owned by ${cofreAccount.owner.toBase58()}, expected ${GATEKEEPER_PROGRAM_ID.toBase58()}. Re-run setup.`,
    );
  }
  const onChainOperator = new PublicKey(cofreAccount.data.subarray(40, 72));
  if (!onChainOperator.equals(operator.publicKey)) {
    throw new Error(
      `Cofre operator mismatch: on-chain ${onChainOperator.toBase58()}, script ${operator.publicKey.toBase58()}. Re-run setup.`,
    );
  }
  console.log("Cofre OK  (verified on-chain)");

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

  const outputKeypair = await generateUtxoKeypair();
  const outputUtxo = await createUtxo(amount, outputKeypair, NATIVE_SOL_MINT);
  const zeroIn0 = await createZeroUtxo(NATIVE_SOL_MINT);
  const zeroIn1 = await createZeroUtxo(NATIVE_SOL_MINT);
  const zeroOut = await createZeroUtxo(NATIVE_SOL_MINT);
  const commitmentBigInt = await computeUtxoCommitment(outputUtxo);
  const commitment = Uint8Array.from(
    Buffer.from(commitmentBigInt.toString(16).padStart(64, "0"), "hex"),
  );
  const nullifier = randomBytes(32);
  const tokenMint = NATIVE_SOL_MINT;
  const recipientVkPub = recipient.toBytes();
  const nonce = randomBytes(16);
  const ttlSecs = 3_600n;
  const recipientBalanceBefore = await connection.getBalance(recipient);

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
  console.log("Amount:      ", `${Number(amount) / LAMPORTS_PER_SOL} SOL`);
  console.log("Recipient before:", `${recipientBalanceBefore / LAMPORTS_PER_SOL} SOL`);

  const multisigAccount = await Multisig.fromAccountAddress(connection, multisigPda);
  const transactionIndex = BigInt(multisigAccount.transactionIndex.toString()) + 1n;

  console.log(`\n[1/${demo.threshold + 4}] vaultTransactionCreate (issue_license) — tx index ${transactionIndex}`);

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
    memo: "F1 test: private send (2-of-N)",
  });
  await confirm(connection, createTxSig);
  console.log("  tx:", createTxSig);

  console.log("\n[2] proposalCreate...");
  const proposalSig = await multisig.rpc.proposalCreate({
    connection,
    feePayer: creator,
    creator,
    multisigPda,
    transactionIndex,
  });
  await confirm(connection, proposalSig);
  console.log("  tx:", proposalSig);

  // Multi-member approvals
  console.log(`\n[3] proposalApprove (${demo.threshold} approvals required)...`);
  const approvers = allMembers.slice(0, demo.threshold);
  for (let i = 0; i < approvers.length; i++) {
    const member = approvers[i];
    if (!member) continue;
    const label = i === 0 ? "creator" : `member${i + 1}`;
    const approveSig = await multisig.rpc.proposalApprove({
      connection,
      feePayer: creator,
      member,
      multisigPda,
      transactionIndex,
    });
    await confirm(connection, approveSig);
    console.log(`  approve(${label}):`, approveSig);
  }

  console.log("\n[4] vaultTransactionExecute (issues license)...");
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

  console.log("\n[5] Cloak transact + fullWithdraw (operator delivers to recipient)...");
  const operatorBalance = await connection.getBalance(operator.publicKey);
  console.log(`Operator balance: ${operatorBalance / LAMPORTS_PER_SOL} SOL`);
  const minOperatorBalance = Number(amount) + 0.01 * LAMPORTS_PER_SOL;
  if (operatorBalance < minOperatorBalance) {
    const fundAmount = minOperatorBalance - operatorBalance + 0.01 * LAMPORTS_PER_SOL;
    console.log(`[preflight] Funding operator with ${fundAmount / LAMPORTS_PER_SOL} SOL...`);
    const fundOpTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: operator.publicKey,
        lamports: Math.ceil(fundAmount),
      }),
    );
    const fundOpSig = await connection.sendTransaction(fundOpTx, [creator], {
      skipPreflight: false,
    });
    await confirm(connection, fundOpSig);
    console.log("  fund tx:", fundOpSig);
  }

  try {
    const depositResult = await transact(
      {
        inputUtxos: [zeroIn0, zeroIn1],
        outputUtxos: [outputUtxo, zeroOut],
        externalAmount: amount,
        depositor: operator.publicKey,
      },
      {
        connection,
        programId: CLOAK_PROGRAM_ID,
        relayUrl: "https://api.devnet.cloak.ag",
        enforceViewingKeyRegistration: false,
        depositorKeypair: operator,
        walletPublicKey: operator.publicKey,
        onProgress: (s: string) => console.error(`[cloak] ${s}`),
        onProofProgress: (p: number) => console.error(`[cloak] proof ${p}%`),
      } as Parameters<typeof transact>[1],
    );
    console.log("  Cloak deposit tx:", depositResult.signature);
    console.log("  Leaf index:", depositResult.commitmentIndices[0]);
    const depositedCommitment = depositResult.outputCommitments[0]
      ?.toString(16)
      .padStart(64, "0");
    console.log(
      "  Commitment match:",
      depositedCommitment === Buffer.from(commitment).toString("hex"),
    );

    const withdrawResult = await fullWithdraw(depositResult.outputUtxos, recipient, {
      connection,
      programId: CLOAK_PROGRAM_ID,
      relayUrl: "https://api.devnet.cloak.ag",
      enforceViewingKeyRegistration: false,
      depositorKeypair: operator,
      walletPublicKey: operator.publicKey,
      cachedMerkleTree: depositResult.merkleTree,
      onProgress: (s: string) => console.error(`[cloak] withdraw ${s}`),
      onProofProgress: (p: number) => console.error(`[cloak] withdraw proof ${p}%`),
    } as Parameters<typeof fullWithdraw>[2]);
    console.log("  Cloak withdraw tx:", withdrawResult.signature);
  } catch (err: unknown) {
    console.error("\n  Cloak delivery FAILED");
    console.error("  message:", (err as Error).message);
    throw err;
  }

  const recipientBalanceAfter = await connection.getBalance(recipient);
  const delivered = recipientBalanceAfter - recipientBalanceBefore;
  const expectedNet = Number(amount - calculateFeeBigint(amount));
  console.log(`  Recipient after: ${recipientBalanceAfter / LAMPORTS_PER_SOL} SOL`);
  console.log(`  Delivered:       ${delivered / LAMPORTS_PER_SOL} SOL`);
  console.log(`  Expected net:    ${expectedNet / LAMPORTS_PER_SOL} SOL`);
  if (delivered < expectedNet) {
    throw new Error(`Recipient balance increased by ${delivered}, expected at least ${expectedNet}`);
  }

  console.log("\n[6] execute_with_license (operator consumes)...");
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

  const { blockhash } = await connection.getLatestBlockhash();
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

  console.log(`\n=== F1 Private Send Test PASSED (${demo.threshold}-of-${demo.numMembers}) ===`);
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
        recipient: recipient.toBase58(),
        recipientBalanceBefore,
        recipientBalanceAfter,
        deliveredLamports: delivered,
        expectedNetLamports: expectedNet,
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
