import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CloakSDK, MemoryStorageAdapter } from "@cloak.dev/sdk";
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

  console.log("=== Cloak SDK Devnet Spike ===");
  console.log("Owner:", owner.toBase58());

  const balanceStart = await connection.getBalance(owner);
  console.log(`Balance start: ${balanceStart / LAMPORTS_PER_SOL} SOL\n`);

  const sdk = new CloakSDK({
    keypairBytes: payer.secretKey,
    network: "devnet",
    storage: new MemoryStorageAdapter(),
    debug: true,
  });

  console.log("[1/2] deposit 0.05 SOL...");
  const depositAmount = 50_000_000;
  const depositResult = await sdk.deposit(connection, depositAmount, {
    onProgress: (status: unknown) => console.log(`  status: ${JSON.stringify(status)}`),
  });
  console.log("  deposit tx:", depositResult.signature ?? "(no signature in result)");
  console.log("  full result:", JSON.stringify(depositResult, null, 2));
  const note = depositResult.note;
  if (!note) {
    throw new Error("Deposit did not return a note");
  }

  const balanceAfterDeposit = await connection.getBalance(owner);
  console.log(`  Balance after deposit: ${balanceAfterDeposit / LAMPORTS_PER_SOL} SOL`);
  console.log(
    `  Spent on deposit: ${(balanceStart - balanceAfterDeposit) / LAMPORTS_PER_SOL} SOL\n`,
  );

  console.log("[2/2] withdraw to same wallet...");
  const logWithdrawStatus = (status: unknown) => console.log(`  status: ${JSON.stringify(status)}`);
  const withdrawResult = await sdk.withdraw(connection, note, owner, {
    withdrawAll: true,
    onProgress: logWithdrawStatus,
    onProofProgress: (pct: number) => console.log(`  proof: ${pct}%`),
  } as never);
  console.log("  withdraw result:", JSON.stringify(withdrawResult, null, 2));

  await new Promise((r) => setTimeout(r, 3000));
  const balanceEnd = await connection.getBalance(owner);
  console.log(`\nBalance end: ${balanceEnd / LAMPORTS_PER_SOL} SOL`);
  console.log(`Net spent: ${(balanceStart - balanceEnd) / LAMPORTS_PER_SOL} SOL (fees + relay)`);

  console.log("\n✅ CLOAK SDK SPIKE PASSED");
  console.log("End-to-end deposit + withdraw against Cloak devnet works.");
}

main().catch((error) => {
  console.error("❌ Spike failed:");
  console.error(error);
  process.exit(1);
});
