/**
 * Change the registered operator of a cofre.
 *
 * The set_operator instruction requires squads_vault as signer,
 * so it must go through a Squads vault transaction (create → approve → execute).
 *
 * Usage: npx tsx scripts/set-operator.ts
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const { Multisig } = multisig.accounts;

const GATEKEEPER_PROGRAM_ID = new PublicKey("WkzdQAdWRmab53mN83ayqiEc4E3gShTwgACBDkPbe4J");

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
    { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    "confirmed",
  );
  console.log(`  ✓ Confirmed: ${signature}`);
}

function ixDiscriminator(name: string): Buffer {
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function buildSetOperatorIx(opts: {
  cofre: PublicKey;
  vaultPda: PublicKey;
  newOperator: PublicKey;
}): TransactionInstruction {
  const data = Buffer.concat([ixDiscriminator("set_operator"), opts.newOperator.toBuffer()]);
  return new TransactionInstruction({
    programId: GATEKEEPER_PROGRAM_ID,
    keys: [
      { pubkey: opts.cofre, isSigner: false, isWritable: true },
      { pubkey: opts.vaultPda, isSigner: true, isWritable: false },
    ],
    data,
  });
}

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const payer = loadKeypair(process.env.SOLANA_KEYPAIR);

  const MULTISIG = new PublicKey("4UyJQecmT5irKwbgWyW3WeARsGfz8vii2cxsXBz5PMt5");
  const NEW_OPERATOR = new PublicKey("QqibVKumHaJAC5bYii7q2QRWf3faYTEj8ff1d6gqST5");

  const [vaultPda] = multisig.getVaultPda({ multisigPda: MULTISIG, index: 0 });
  const [cofrePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("cofre"), MULTISIG.toBuffer()],
    GATEKEEPER_PROGRAM_ID,
  );

  console.log("=== Set Operator ===");
  console.log("Multisig:    ", MULTISIG.toBase58());
  console.log("Vault PDA:   ", vaultPda.toBase58());
  console.log("Cofre PDA:   ", cofrePda.toBase58());
  console.log("New operator:", NEW_OPERATOR.toBase58());
  console.log("");

  const setOpIx = buildSetOperatorIx({ cofre: cofrePda, vaultPda, newOperator: NEW_OPERATOR });

  const multisigAccount = await Multisig.fromAccountAddress(connection, MULTISIG);
  const currentTxIndex = BigInt(multisigAccount.transactionIndex.toString());
  const txIndex = currentTxIndex + 1n;
  console.log(`Current txIndex: ${currentTxIndex}, using: ${txIndex}`);

  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: [setOpIx],
  });

  console.log("1. Creating vault transaction...");
  const createSig = await multisig.rpc.vaultTransactionCreate({
    connection,
    feePayer: payer,
    multisigPda: MULTISIG,
    transactionIndex: txIndex,
    creator: payer.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    memo: "set operator",
  });
  await confirm(connection, createSig);

  console.log("2. Creating proposal...");
  const proposalSig = await multisig.rpc.proposalCreate({
    connection,
    feePayer: payer,
    creator: payer,
    multisigPda: MULTISIG,
    transactionIndex: txIndex,
  });
  await confirm(connection, proposalSig);

  console.log("3. Approving proposal...");
  const approveSig = await multisig.rpc.proposalApprove({
    connection,
    feePayer: payer,
    member: payer,
    multisigPda: MULTISIG,
    transactionIndex: txIndex,
  });
  await confirm(connection, approveSig);

  console.log("4. Executing vault transaction...");
  const executeSig = await multisig.rpc.vaultTransactionExecute({
    connection,
    feePayer: payer,
    multisigPda: MULTISIG,
    transactionIndex: txIndex,
    member: payer.publicKey,
    signers: [payer],
  });
  await confirm(connection, executeSig);

  console.log("\n=== Done ===");
  console.log(`Operator changed to: ${NEW_OPERATOR.toBase58()}`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
