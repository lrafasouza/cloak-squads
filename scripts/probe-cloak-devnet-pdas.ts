import {
  CLOAK_PROGRAM_ID,
  DEVNET_MOCK_USDC_MINT,
  NATIVE_SOL_MINT,
  getShieldPoolPDAs,
} from "@cloak.dev/sdk-devnet";
import { Connection } from "@solana/web3.js";

async function probe(label: string, mint: typeof NATIVE_SOL_MINT) {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const pdas = getShieldPoolPDAs(CLOAK_PROGRAM_ID, mint);
  console.log(`\n=== ${label} (mint=${mint.toBase58()}) ===`);
  for (const [name, pk] of Object.entries(pdas)) {
    const info = await connection.getAccountInfo(pk);
    const status = info ? `INIT (${info.data.length}B, owner=${info.owner.toBase58().slice(0, 8)}…)` : "MISSING";
    console.log(`  ${name.padEnd(16)} ${pk.toBase58()}  →  ${status}`);
  }
}

async function main() {
  console.log("Cloak program:", CLOAK_PROGRAM_ID.toBase58());
  await probe("SOL pool", NATIVE_SOL_MINT);
  await probe("Mock USDC pool", DEVNET_MOCK_USDC_MINT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
