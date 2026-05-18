/**
 * Manually execute an already-approved Squads governance vault transaction.
 * Bypasses @sqds/multisig's `rpc.vaultTransactionExecute` (which throws a
 * non-Error in newer Node, losing the actual sim logs).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
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

async function main() {
  const txArg = arg("--tx");
  if (!txArg) throw new Error("Usage: --tx <transactionIndex>");
  const transactionIndex = BigInt(txArg);

  const memberA = loadKeypair(path.join(os.homedir(), ".config/solana/cloak-devnet.json"));
  const c = new Connection(RPC, "confirmed");

  console.log("Building execute ix for tx", transactionIndex.toString(), "...");
  const { instruction, lookupTableAccounts } = await multisig.instructions.vaultTransactionExecute({
    connection: c,
    multisigPda: GOV_MULTISIG,
    transactionIndex,
    member: memberA.publicKey,
  });

  // Bump CU + priority fee for a BPF upgrade — it's expensive.
  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }))
    .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2000 }))
    .add(instruction);

  tx.feePayer = memberA.publicKey;
  const latest = await c.getLatestBlockhash();
  tx.recentBlockhash = latest.blockhash;
  tx.sign(memberA);

  console.log("Simulating before send...");
  const sim = await c.simulateTransaction(tx);
  if (sim.value.err) {
    console.error("\n❌ Simulation failed:");
    console.error("err:", JSON.stringify(sim.value.err));
    console.error("\nLogs:");
    for (const line of sim.value.logs ?? []) console.error("  ", line);
    process.exit(1);
  }
  console.log("Simulation OK. CUs:", sim.value.unitsConsumed);

  console.log("Sending...");
  const sig = await c.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  console.log("Tx:", sig);
  await c.confirmTransaction({ signature: sig, ...latest }, "confirmed");
  console.log("\n✅ Confirmed");
  console.log("Explorer:", `https://explorer.solana.com/tx/${sig}?cluster=devnet`);

  // lookupTableAccounts unused for now — keeping the SDK return shape happy.
  void lookupTableAccounts;
}

main().catch((err) => {
  console.error("\n❌ Failed:", err);
  process.exit(1);
});
