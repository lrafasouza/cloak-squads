/**
 * Sets up a 1-of-1 Squads multisig + Cloak gatekeeper Cofre on devnet for solo F1 testing.
 *
 * Difference vs spike-squads-devnet.ts:
 * - threshold = 1 (no second signer needed)
 * - members = [creator] (you can approve and execute alone in the frontend)
 * - persists multisig + cofre + operator + createKey to scripts/.demo-cofre.json
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
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
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_FILE = path.join(__dirname, ".demo-cofre.json");

function loadKeypair(filePath = path.join(os.homedir(), ".config/solana/id.json")) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Keypair not found at ${filePath}. Set SOLANA_KEYPAIR env var.`);
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf-8")) as number[]),
  );
}

async function confirm(connection: Connection, signature: string) {
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
}

function ixDiscriminator(name: string) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
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

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const creator = loadKeypair(process.env.SOLANA_KEYPAIR);
  const createKey = Keypair.generate();
  const operator = Keypair.generate();
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
  const [cofrePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("cofre"), multisigPda.toBuffer()],
    GATEKEEPER_PROGRAM_ID,
  );

  console.log("=== Cloak-Squads 1-of-1 Demo Cofre (devnet) ===");
  console.log("Creator (you): ", creator.publicKey.toBase58());
  console.log("Multisig PDA:  ", multisigPda.toBase58());
  console.log("Vault PDA:     ", vaultPda.toBase58());
  console.log("Cofre PDA:     ", cofrePda.toBase58());
  console.log("Operator:      ", operator.publicKey.toBase58());

  const balance = await connection.getBalance(creator.publicKey);
  console.log(`Creator balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  if (balance < 1 * LAMPORTS_PER_SOL) {
    throw new Error("Creator needs at least 1 SOL for multisig + vault funding");
  }

  const memberPermissions = Permissions.fromPermissions([
    Permission.Initiate,
    Permission.Vote,
    Permission.Execute,
  ]);

  const [programConfigPda] = multisig.getProgramConfigPda({});
  const programConfig = await ProgramConfig.fromAccountAddress(connection, programConfigPda);
  const treasury = programConfig.treasury;
  console.log("Treasury:      ", treasury.toBase58());

  console.log("\n[1/6] multisigCreateV2 (1-of-1)...");
  const createSig = await multisig.rpc.multisigCreateV2({
    connection,
    treasury,
    createKey,
    creator,
    multisigPda,
    configAuthority: null,
    threshold: 1,
    members: [{ key: creator.publicKey, permissions: memberPermissions }],
    timeLock: 0,
    rentCollector: null,
    memo: "cloak-squads demo 1-of-1",
  });
  await confirm(connection, createSig);
  console.log("  tx:", createSig);

  console.log("\n[2/6] Fund vault (rent for Cofre init)...");
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
  console.log("  tx:", fundVaultSig);

  const multisigAccount = await Multisig.fromAccountAddress(connection, multisigPda);
  const transactionIndex = BigInt(multisigAccount.transactionIndex.toString()) + 1n;

  const viewKeyPublic = new Uint8Array(32);
  viewKeyPublic.fill(0xcc);

  const innerIx = buildInitCofreIx({
    cofre: cofrePda,
    vaultPda,
    multisig: multisigPda,
    operator: operator.publicKey,
    viewKeyPublic,
  });
  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: [innerIx],
  });

  console.log("\n[3/6] vaultTransactionCreate (inner ix = init_cofre)...");
  const createTxSig = await multisig.rpc.vaultTransactionCreate({
    connection,
    feePayer: creator,
    multisigPda,
    transactionIndex,
    creator: creator.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    memo: "demo init_cofre via squads vault",
  });
  await confirm(connection, createTxSig);
  console.log("  tx:", createTxSig);

  console.log("\n[4/6] proposalCreate...");
  const proposalSig = await multisig.rpc.proposalCreate({
    connection,
    feePayer: creator,
    creator,
    multisigPda,
    transactionIndex,
  });
  await confirm(connection, proposalSig);
  console.log("  tx:", proposalSig);

  console.log("\n[5/6] Single approval (threshold=1)...");
  const approveSig = await multisig.rpc.proposalApprove({
    connection,
    feePayer: creator,
    member: creator,
    multisigPda,
    transactionIndex,
  });
  await confirm(connection, approveSig);
  console.log("  approve(creator):", approveSig);

  console.log("\n[6/6] vaultTransactionExecute...");
  const executeSig = await multisig.rpc.vaultTransactionExecute({
    connection,
    feePayer: creator,
    multisigPda,
    transactionIndex,
    member: creator.publicKey,
  });
  await confirm(connection, executeSig);
  console.log("  tx:", executeSig);

  console.log("\n=== Verifying Cofre on-chain ===");
  const cofreAccount = await connection.getAccountInfo(cofrePda);
  if (!cofreAccount) throw new Error(`FAIL: Cofre account ${cofrePda.toBase58()} not found`);
  if (!cofreAccount.owner.equals(GATEKEEPER_PROGRAM_ID)) {
    throw new Error(
      `FAIL: Cofre owner mismatch. Expected ${GATEKEEPER_PROGRAM_ID.toBase58()}, got ${cofreAccount.owner.toBase58()}`,
    );
  }

  const summary = {
    multisig: multisigPda.toBase58(),
    vault: vaultPda.toBase58(),
    cofre: cofrePda.toBase58(),
    creator: creator.publicKey.toBase58(),
    operator: operator.publicKey.toBase58(),
    operatorSecretKey: Array.from(operator.secretKey),
    createKey: Array.from(createKey.secretKey),
    threshold: 1,
    setupTx: executeSig,
    explorer: `https://explorer.solana.com/tx/${executeSig}?cluster=devnet`,
    sendUrl: `http://localhost:3000/cofre/${multisigPda.toBase58()}/send`,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(summary, null, 2));

  console.log("\n✅ DEMO COFRE READY (1-of-1)");
  console.log(JSON.stringify({ ...summary, operatorSecretKey: "[redacted]", createKey: "[redacted]" }, null, 2));
  console.log(`\nFull config (with secrets) saved to: ${OUT_FILE}`);
  console.log(`\nNext: open ${summary.sendUrl} in your browser.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
