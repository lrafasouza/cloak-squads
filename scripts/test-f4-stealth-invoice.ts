import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../apps/web/lib/prisma";
import {
  CLOAK_PROGRAM_ID,
  NATIVE_SOL_MINT,
  calculateFeeBigint,
  computeUtxoCommitment,
  createUtxo,
  createZeroUtxo,
  derivePublicKey,
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
const DEMO_FILE = path.join(__dirname, ".demo-cofre.json");

const GATEKEEPER_PROGRAM_ID = new PublicKey("AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq");
const PAYLOAD_DOMAIN_SEP = Buffer.from("cloak-squads-payload-v1\0", "utf-8");

type DemoCofre = {
  multisig: string;
  vault: string;
  cofre: string;
  creator: string;
  operator: string;
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

function readKeypair(pathArg: string) {
  const expanded = pathArg.replace("~", process.env.HOME || "");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(expanded, "utf-8"))));
}

function readArgs(): { recipient: Keypair; amountSol: number } {
  const recipientKeypairArg = process.env.RECIPIENT_KEYPAIR;
  const amountArg = process.argv[2];
  if (!recipientKeypairArg || !amountArg) {
    throw new Error("Usage: RECIPIENT_KEYPAIR=<path> pnpm test:f4 <amount-in-sol>");
  }
  const amountSol = Number.parseFloat(amountArg);
  if (Number.isNaN(amountSol) || amountSol <= 0) {
    throw new Error(`Invalid amount: ${amountArg}`);
  }
  return { recipient: readKeypair(recipientKeypairArg), amountSol };
}

async function main() {
  const { recipient, amountSol } = readArgs();
  const amount = BigInt(Math.ceil(amountSol * LAMPORTS_PER_SOL));

  if (!process.env.DATABASE_URL) {
    throw new Error("Set DATABASE_URL to the web Prisma sqlite database.");
  }
  if (!fs.existsSync(DEMO_FILE)) {
    throw new Error(`Demo cofre not found at ${DEMO_FILE}. Run "pnpm demo:setup <operator-pubkey>" first.`);
  }
  const operatorKeypairEnv = process.env.OPERATOR_KEYPAIR;
  const creatorKeypairEnv = process.env.SOLANA_KEYPAIR;
  if (!operatorKeypairEnv) throw new Error("Set OPERATOR_KEYPAIR env var.");
  if (!creatorKeypairEnv) throw new Error("Set SOLANA_KEYPAIR env var.");

  const demo: DemoCofre = JSON.parse(fs.readFileSync(DEMO_FILE, "utf-8"));
  const multisigPda = new PublicKey(demo.multisig);
  const vaultPda = new PublicKey(demo.vault);
  const cofrePda = new PublicKey(demo.cofre);
  const creator = readKeypair(creatorKeypairEnv);
  const operator = readKeypair(operatorKeypairEnv);
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  console.log("=== F4 Stealth Invoice - Devnet Test ===");
  console.log("Multisig: ", multisigPda.toBase58());
  console.log("Cofre:    ", cofrePda.toBase58());
  console.log("Operator: ", operator.publicKey.toBase58());
  console.log("Recipient:", recipient.publicKey.toBase58());

  const cofreAccount = await connection.getAccountInfo(cofrePda);
  if (!cofreAccount) throw new Error(`Cofre ${cofrePda.toBase58()} not found on devnet.`);
  const onChainOperator = new PublicKey(cofreAccount.data.subarray(40, 72));
  if (!onChainOperator.equals(operator.publicKey)) {
    throw new Error(`Cofre operator mismatch: on-chain ${onChainOperator.toBase58()}, script ${operator.publicKey.toBase58()}.`);
  }

  const creatorBalance = await connection.getBalance(creator.publicKey);
  if (creatorBalance < 0.5 * LAMPORTS_PER_SOL) throw new Error("Creator needs at least 0.5 SOL");
  const operatorBalance = await connection.getBalance(operator.publicKey);
  const minOperatorBalance = Number(amount) + 0.02 * LAMPORTS_PER_SOL;
  if (operatorBalance < minOperatorBalance) {
    const fundOpTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: operator.publicKey,
        lamports: Math.ceil(minOperatorBalance - operatorBalance),
      }),
    );
    const fundOpSig = await connection.sendTransaction(fundOpTx, [creator], { skipPreflight: false });
    await confirm(connection, fundOpSig);
    console.log("Fund operator tx:", fundOpSig);
  }

  const invoice = await prisma.stealthInvoice.create({
    data: {
      cofreAddress: multisigPda.toBase58(),
      recipientWallet: recipient.publicKey.toBase58(),
      invoiceRef: `f4-real-${Date.now()}`,
      memo: "F4 real devnet test",
      stealthPubkey: Keypair.generate().publicKey.toBase58(),
      amountHintEncrypted: Buffer.from(amount.toString()),
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  console.log("Invoice:", invoice.id);

  const outputKeypair = await generateUtxoKeypair();
  const outputUtxo = await createUtxo(amount, outputKeypair, NATIVE_SOL_MINT);
  const zeroIn0 = await createZeroUtxo(NATIVE_SOL_MINT);
  const zeroIn1 = await createZeroUtxo(NATIVE_SOL_MINT);
  const zeroOut = await createZeroUtxo(NATIVE_SOL_MINT);
  const commitmentBigInt = await computeUtxoCommitment(outputUtxo);
  const commitmentHex = commitmentBigInt.toString(16).padStart(64, "0");
  const commitment = Uint8Array.from(Buffer.from(commitmentHex, "hex"));
  const nullifier = randomBytes(32);
  const recipientVkPub = recipient.publicKey.toBytes();
  const nonce = randomBytes(16);
  const payloadHash = computePayloadHash({
    nullifier,
    commitment,
    amount,
    tokenMint: NATIVE_SOL_MINT,
    recipientVkPub,
    nonce,
  });
  const [licensePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("license"), cofrePda.toBuffer(), Buffer.from(payloadHash)],
    GATEKEEPER_PROGRAM_ID,
  );

  const multisigAccount = await Multisig.fromAccountAddress(connection, multisigPda);
  const transactionIndex = BigInt(multisigAccount.transactionIndex.toString()) + 1n;
  console.log("Transaction index:", transactionIndex.toString());
  console.log("Payload hash:", Buffer.from(payloadHash).toString("hex"));

  const innerIx = buildIssueLicenseIx({
    cofre: cofrePda,
    license: licensePda,
    squadsVault: vaultPda,
    payloadHash,
    nonce,
    ttlSecs: 3_600n,
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
    memo: "F4 test: stealth invoice",
  });
  await confirm(connection, createTxSig);
  console.log("Create tx:", createTxSig);

  const proposalSig = await multisig.rpc.proposalCreate({
    connection,
    feePayer: creator,
    creator,
    multisigPda,
    transactionIndex,
  });
  await confirm(connection, proposalSig);
  console.log("Proposal tx:", proposalSig);

  const approveSig = await multisig.rpc.proposalApprove({
    connection,
    feePayer: creator,
    member: creator,
    multisigPda,
    transactionIndex,
  });
  await confirm(connection, approveSig);
  console.log("Approve tx:", approveSig);

  const issueSig = await multisig.rpc.vaultTransactionExecute({
    connection,
    feePayer: creator,
    multisigPda,
    transactionIndex,
    member: creator.publicKey,
    signers: [creator],
  });
  await confirm(connection, issueSig);
  console.log("Issue license tx:", issueSig);

  await prisma.proposalDraft.create({
    data: {
      cofreAddress: multisigPda.toBase58(),
      transactionIndex: transactionIndex.toString(),
      amount: amount.toString(),
      recipient: recipient.publicKey.toBase58(),
      memo: "F4 real devnet test",
      payloadHash: Buffer.from(payloadHash),
      invariants: JSON.stringify({
        nullifier: Array.from(nullifier),
        commitment: Array.from(commitment),
        amount: amount.toString(),
        tokenMint: NATIVE_SOL_MINT.toBase58(),
        recipientVkPub: Array.from(recipientVkPub),
        nonce: Array.from(nonce),
      }),
      commitmentClaim: JSON.stringify({
        invoiceId: invoice.id,
        amount: amount.toString(),
        keypairPrivateKey: outputKeypair.privateKey.toString(16).padStart(64, "0"),
        keypairPublicKey: outputKeypair.publicKey.toString(16).padStart(64, "0"),
        blinding: outputUtxo.blinding.toString(16).padStart(64, "0"),
        commitment: commitmentHex,
        recipient_vk: recipient.publicKey.toBase58(),
        token_mint: NATIVE_SOL_MINT.toBase58(),
      }),
      signature: createTxSig,
    },
  });

  const recipientBeforeOperator = await connection.getBalance(recipient.publicKey);
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
      onProgress: (s: string) => console.error(`[cloak-f4] ${s}`),
      onProofProgress: (p: number) => console.error(`[cloak-f4] proof ${p}%`),
    } as Parameters<typeof transact>[1],
  );
  console.log("Cloak deposit tx:", depositResult.signature);

  const depositedCommitment = depositResult.outputCommitments[0]?.toString(16).padStart(64, "0");
  if (depositedCommitment !== commitmentHex) {
    throw new Error("Deposited commitment does not match approved commitment.");
  }
  const leafIndex = depositResult.commitmentIndices[0];
  if (leafIndex === undefined) throw new Error("Deposit returned no leaf index.");

  await prisma.stealthInvoice.update({
    where: { id: invoice.id },
    data: {
      utxoAmount: amount.toString(),
      utxoPrivateKey: outputKeypair.privateKey.toString(16).padStart(64, "0"),
      utxoPublicKey: outputKeypair.publicKey.toString(16).padStart(64, "0"),
      utxoBlinding: outputUtxo.blinding.toString(16).padStart(64, "0"),
      utxoMint: NATIVE_SOL_MINT.toBase58(),
      utxoLeafIndex: leafIndex,
      utxoCommitment: commitmentHex,
    },
  });
  const recipientAfterOperator = await connection.getBalance(recipient.publicKey);
  if (recipientAfterOperator !== recipientBeforeOperator) {
    throw new Error("F4 operator phase delivered SOL directly; expected invoice claim only.");
  }

  const executeIx = buildExecuteWithLicenseIx({
    cofre: cofrePda,
    license: licensePda,
    operator: operator.publicKey,
    nullifier,
    commitment,
    amount,
    tokenMint: NATIVE_SOL_MINT,
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
  console.log("Consume license tx:", consumeSig);

  const claimInvoice = await prisma.stealthInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
  const privateKey = BigInt(`0x${claimInvoice.utxoPrivateKey?.padStart(64, "0")}`);
  const publicKey = await derivePublicKey(privateKey);
  const claimUtxo = await createUtxo(BigInt(claimInvoice.utxoAmount ?? "0"), { privateKey, publicKey }, NATIVE_SOL_MINT);
  claimUtxo.blinding = BigInt(`0x${claimInvoice.utxoBlinding}`);
  claimUtxo.commitment = await computeUtxoCommitment(claimUtxo);
  claimUtxo.index = claimInvoice.utxoLeafIndex ?? undefined;

  const recipientBeforeClaim = await connection.getBalance(recipient.publicKey);
  const claimResult = await fullWithdraw([claimUtxo], recipient.publicKey, {
    connection,
    programId: CLOAK_PROGRAM_ID,
    relayUrl: "https://api.devnet.cloak.ag",
    depositorKeypair: recipient,
    walletPublicKey: recipient.publicKey,
    onProgress: (s: string) => console.error(`[cloak-f4-claim] ${s}`),
    onProofProgress: (p: number) => console.error(`[cloak-f4-claim] proof ${p}%`),
  } as Parameters<typeof fullWithdraw>[2]);
  console.log("Claim withdraw tx:", claimResult.signature);

  const recipientAfterClaim = await connection.getBalance(recipient.publicKey);
  const delivered = recipientAfterClaim - recipientBeforeClaim;
  const expectedNet = Number(amount - calculateFeeBigint(amount));
  console.log("Delivered:", delivered);
  console.log("Expected net:", expectedNet);
  if (delivered < expectedNet) {
    throw new Error(`Recipient balance increased by ${delivered}, expected at least ${expectedNet}`);
  }

  await prisma.stealthInvoice.update({
    where: { id: invoice.id },
    data: { status: "claimed", claimedAt: new Date(), claimedBy: recipient.publicKey.toBase58() },
  });
  await prisma.$disconnect();

  console.log("\n=== F4 Stealth Invoice Test PASSED ===");
  console.log(
    JSON.stringify(
      {
        invoiceId: invoice.id,
        multisig: multisigPda.toBase58(),
        license: licensePda.toBase58(),
        issueTx: issueSig,
        cloakDepositTx: depositResult.signature,
        consumeTx: consumeSig,
        claimTx: claimResult.signature,
        recipient: recipient.publicKey.toBase58(),
        recipientBeforeOperator,
        recipientAfterOperator,
        recipientBeforeClaim,
        recipientAfterClaim,
        deliveredLamports: delivered,
        expectedNetLamports: expectedNet,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error("\nF4 TEST FAILED:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
