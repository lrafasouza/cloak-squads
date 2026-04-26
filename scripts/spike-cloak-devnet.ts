import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
// NOTE: kept on devnet SDK to demonstrate the upstream bug (see docs/devnet-blocker.md).
// Switch back to "@cloak.dev/sdk" when running against mainnet for the final pre-prod smoke.
import { CloakSDK, MemoryStorageAdapter, generateNote } from "@cloak.dev/sdk-devnet";
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

  console.log("=== Cloak SDK Devnet Spike (unified transact path) ===");
  console.log("Owner:", owner.toBase58());

  const balanceStart = await connection.getBalance(owner);
  console.log(`Balance start: ${balanceStart / LAMPORTS_PER_SOL} SOL\n`);

  const sdk = new CloakSDK({
    keypairBytes: payer.secretKey,
    network: "devnet",
    storage: new MemoryStorageAdapter(),
    debug: true,
  });

  const amount = 50_000_000;

  console.log("[1/2] generating note (no on-chain deposit yet)...");
  const note = await generateNote(amount, "devnet");
  console.log("  commitment:", note.commitment);

  console.log("\n[2/2] privateTransfer (deposit + withdraw to self in one flow)...");
  const result = await sdk.privateTransfer(
    connection,
    note,
    [{ recipient: owner, amount: amount - 100_000 }],
    {
      onProgress: (status: string) => console.log(`  status: ${status}`),
      onProofProgress: (pct: number) => console.log(`  proof: ${pct}%`),
    },
  );
  console.log("  result:", JSON.stringify(result, null, 2));

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
