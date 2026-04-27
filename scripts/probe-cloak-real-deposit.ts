import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  CLOAK_PROGRAM_ID,
  NATIVE_SOL_MINT,
  computeUtxoCommitment,
  createZeroUtxo,
  deriveUtxoKeypairFromSpendKey,
  generateUtxoKeypair,
  randomFieldElement,
  transact,
} from "@cloak.dev/sdk-devnet";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

function loadKeypair() {
  const p = process.env.SOLANA_KEYPAIR ?? path.join(os.homedir(), ".config/solana/id.json");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf-8"))));
}

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const payer = loadKeypair();
  console.log("Payer:", payer.publicKey.toBase58(), "balance:", await connection.getBalance(payer.publicKey) / LAMPORTS_PER_SOL, "SOL");

  const skBytes = new Uint8Array(32);
  crypto.getRandomValues(skBytes);
  const blinding = randomFieldElement();
  const amount = BigInt(50_000_000);

  const keypair = await deriveUtxoKeypairFromSpendKey(skBytes);
  const utxo = { amount, keypair, blinding, mintAddress: NATIVE_SOL_MINT };
  const expectedCommitment = await computeUtxoCommitment(utxo);
  console.log("Expected commitment (pre-compute):", expectedCommitment.toString(16));

  const keypair2 = await deriveUtxoKeypairFromSpendKey(skBytes);
  const outputUtxo = { amount, keypair: keypair2, blinding, mintAddress: NATIVE_SOL_MINT };
  const recomputed = await computeUtxoCommitment(outputUtxo);
  console.log("Recomputed commitment:           ", recomputed.toString(16));
  console.log("Commitment match:", expectedCommitment === recomputed ? "✅ YES" : "❌ NO");

  const zero = await createZeroUtxo(NATIVE_SOL_MINT);

  console.log("\nCalling transact() with relay risk quote...");
  const result = await transact(
    { inputUtxos: [], outputUtxos: [outputUtxo, zero], externalAmount: amount, depositor: payer.publicKey },
    {
      connection,
      programId: CLOAK_PROGRAM_ID,
      relayUrl: "https://api.devnet.cloak.ag",
      enforceViewingKeyRegistration: false,
      useChainRootForProof: true,
      depositorKeypair: payer,
      onProgress: (s) => console.log("  status:", s),
      onProofProgress: (p) => console.log("  proof:", p, "%"),
    },
  );
  console.log("\n✅ tx signature:", result.signature);
  console.log("output commitments:", result.outputCommitments.map(c => c.toString(16)));
  console.log("On-chain match pre-computed:", result.outputCommitments[0] === expectedCommitment ? "✅ YES" : "❌ NO");
  console.log("leaf indices:", result.commitmentIndices);
}

main().catch((e) => { console.error(e); process.exit(1); });
