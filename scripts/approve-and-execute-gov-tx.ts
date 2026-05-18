/**
 * Approve + execute a Squads governance vault transaction with both
 * 2-of-2 keypairs. Devnet-only convenience: in production both halves
 * should never live on the same machine.
 *
 * Usage:
 *   pnpm tsx scripts/approve-and-execute-gov-tx.ts --tx <index>
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const RPC = process.env.AEGIS_RPC ?? "https://api.devnet.solana.com";
const GOV_MULTISIG = new PublicKey("7ze4naRtWQyg1Jhe1ScvhaY1NdVPdDfyScidX3peaFhd");

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf-8")) as number[]),
  );
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

async function confirm(connection: Connection, sig: string) {
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
}

async function main() {
  const txArg = arg("--tx");
  if (!txArg) throw new Error("Usage: --tx <transactionIndex>");
  const transactionIndex = BigInt(txArg);

  const memberA = loadKeypair(path.join(os.homedir(), ".config/solana/cloak-devnet.json"));
  const memberB = loadKeypair(path.join(os.homedir(), ".config/solana/aegis-governance-cold.json"));

  console.log("=== Approve + Execute governance tx", transactionIndex.toString(), "===");
  console.log("Multisig:    ", GOV_MULTISIG.toBase58());
  console.log("Member A:    ", memberA.publicKey.toBase58());
  console.log("Member B:    ", memberB.publicKey.toBase58(), "(cold — devnet only)");
  console.log();

  const c = new Connection(RPC, "confirmed");

  console.log("[1/3] proposalApprove (member A)...");
  const sigA = await multisig.rpc.proposalApprove({
    connection: c,
    feePayer: memberA,
    member: memberA,
    multisigPda: GOV_MULTISIG,
    transactionIndex,
  });
  await confirm(c, sigA);
  console.log("  tx:", sigA);

  console.log("[2/3] proposalApprove (member B)...");
  const sigB = await multisig.rpc.proposalApprove({
    connection: c,
    feePayer: memberA,
    member: memberB,
    multisigPda: GOV_MULTISIG,
    transactionIndex,
  });
  await confirm(c, sigB);
  console.log("  tx:", sigB);

  console.log("[3/3] vaultTransactionExecute...");
  const sigExec = await multisig.rpc.vaultTransactionExecute({
    connection: c,
    feePayer: memberA,
    multisigPda: GOV_MULTISIG,
    transactionIndex,
    member: memberA.publicKey,
    signers: [memberA],
  });
  await confirm(c, sigExec);
  console.log("  tx:", sigExec);
  console.log();
  console.log("✅ Governance tx", transactionIndex.toString(), "executed.");
  console.log("Explorer:", `https://explorer.solana.com/tx/${sigExec}?cluster=devnet`);
}

main().catch((err) => {
  console.error("\n❌ Failed:", err);
  process.exit(1);
});
