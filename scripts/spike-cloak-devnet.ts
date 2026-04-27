import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  CLOAK_PROGRAM_ID,
  NATIVE_SOL_MINT,
  createUtxo,
  createZeroUtxo,
  generateUtxoKeypair,
  transact,
} from "@cloak.dev/sdk-devnet";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

function loadKeypair(filePath = path.join(os.homedir(), ".config/solana/id.json")) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Keypair not found at ${filePath}. Set SOLANA_KEYPAIR env var.`);
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf-8")) as number[]),
  );
}

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const payer = loadKeypair(process.env.SOLANA_KEYPAIR);
  const owner = payer.publicKey;

  console.log("=== Cloak SDK Devnet Spike (transact workaround) ===");
  console.log("Owner:", owner.toBase58());

  const balanceStart = await connection.getBalance(owner);
  console.log(`Balance start: ${balanceStart / LAMPORTS_PER_SOL} SOL\n`);

  const amount = 50_000_000n;

  console.log("[1/3] building output UTXO...");
  const outputKeypair = await generateUtxoKeypair();
  const outputUtxo = await createUtxo(amount, outputKeypair, NATIVE_SOL_MINT);

  console.log("[2/3] building zero-padding UTXOs...");
  const zeroIn0 = await createZeroUtxo(NATIVE_SOL_MINT);
  const zeroIn1 = await createZeroUtxo(NATIVE_SOL_MINT);
  const zeroOut = await createZeroUtxo(NATIVE_SOL_MINT);

  console.log("[3/3] transact (deposit via disc-0)...");
  const result = await transact(
    {
      inputUtxos: [zeroIn0, zeroIn1],
      outputUtxos: [outputUtxo, zeroOut],
      externalAmount: amount,
      depositor: owner,
    },
    {
      connection,
      programId: CLOAK_PROGRAM_ID,
      relayUrl: "https://api.devnet.cloak.ag",
      depositorKeypair: payer,
      onProgress: (s: string) => console.log(`  status: ${s}`),
      onProofProgress: (p: number) => console.log(`  proof: ${p}%`),
    },
  );
  console.log("  signature:", result.signature);
  console.log("  output commitment:", result.outputCommitments[0]!.toString(16));
  console.log("  leaf index:", result.commitmentIndices[0]!);

  await new Promise((r) => setTimeout(r, 3000));
  const balanceEnd = await connection.getBalance(owner);
  console.log(`\nBalance end: ${balanceEnd / LAMPORTS_PER_SOL} SOL`);
  console.log(`Net spent: ${(balanceStart - balanceEnd) / LAMPORTS_PER_SOL} SOL (fees + relay)`);

  console.log("\n✅ CLOAK SDK SPIKE PASSED");
}

main().catch((error) => {
  console.error("❌ Spike failed:");
  console.error(error);
  process.exit(1);
});
