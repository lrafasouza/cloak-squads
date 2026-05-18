/**
 * BPFLoaderUpgradeable ExtendProgram — permissionless extension of the
 * ProgramData account's allocated size. `solana program extend` CLI insists
 * the caller equal the upgrade authority (client-side safety check), but the
 * runtime instruction itself doesn't require an authority signer — anyone can
 * pay rent to extend.
 *
 * Use this when an upgrade target binary is larger than the current
 * ProgramData allocation (`account data too small for instruction`).
 *
 * Layout (variant 6):
 *   Data: [u32 variant_id=6][u32 additional_bytes]
 *   Accounts:
 *     0. [writable] ProgramData
 *     1. [writable] Program account
 *     2. []         System program
 *     3. [signer]   Payer (optional but required to fund the rent diff)
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
} from "@solana/web3.js";

const RPC = process.env.AEGIS_RPC ?? "https://api.devnet.solana.com";
const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

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
  const programArg = arg("--program");
  const bytesArg = arg("--bytes");
  if (!programArg || !bytesArg) {
    throw new Error("Usage: --program <ID> --bytes <additionalBytes>");
  }
  const program = new PublicKey(programArg);
  const additionalBytes = Number(bytesArg);

  const payer = loadKeypair(
    process.env.SOLANA_KEYPAIR ?? path.join(os.homedir(), ".config/solana/cloak-devnet.json"),
  );
  const c = new Connection(RPC, "confirmed");

  const [programData] = PublicKey.findProgramAddressSync(
    [program.toBuffer()],
    BPF_LOADER_UPGRADEABLE,
  );

  // Build ExtendProgram ix data: [u32 variant=6][u32 additional_bytes]
  const data = Buffer.alloc(8);
  data.writeUInt32LE(6, 0);
  data.writeUInt32LE(additionalBytes, 4);

  const ix = new TransactionInstruction({
    programId: BPF_LOADER_UPGRADEABLE,
    keys: [
      { pubkey: programData, isSigner: false, isWritable: true },
      { pubkey: program, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    ],
    data,
  });

  console.log("Extending", program.toBase58(), "by", additionalBytes, "bytes...");
  console.log("ProgramData:", programData.toBase58());
  console.log("Payer:      ", payer.publicKey.toBase58());

  const tx = new Transaction().add(ix);
  tx.feePayer = payer.publicKey;
  const latest = await c.getLatestBlockhash();
  tx.recentBlockhash = latest.blockhash;
  tx.sign(payer);

  const sim = await c.simulateTransaction(tx);
  if (sim.value.err) {
    console.error("Sim failed:", JSON.stringify(sim.value.err));
    for (const l of sim.value.logs ?? []) console.error("  ", l);
    process.exit(1);
  }

  const sig = await c.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await c.confirmTransaction({ signature: sig, ...latest }, "confirmed");
  console.log("✅ Extended. Tx:", sig);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
