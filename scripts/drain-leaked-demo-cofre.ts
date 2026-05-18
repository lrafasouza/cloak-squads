/**
 * EMERGENCY — drain the leaked demo-cofre-2ofn devnet vault.
 *
 * Context: scripts/.demo-cofre-2ofn.json was committed to public master between
 *   2026-04-29 (commit a8bff68) and 2026-05-01 (commit 682cb87). Member secret
 *   keys (2-of-3) are assumed scraped. Multisig 2b7mF6Q... is decommissioned.
 *   See docs/security/reports/2026-05-11-secrets.md (finding F-001).
 *
 * What this script does:
 *   1. Reads .demo-cofre-2ofn.json from disk (you must restore it from git
 *      history first — it is gitignored and removed from the working tree)
 *   2. Loads your creator keypair from SOLANA_KEYPAIR / ~/.config/solana/id.json
 *   3. Queries current vault SOL balance on devnet
 *   4. Builds a SystemProgram.transfer(vault → destination, balance - buffer)
 *   5. Submits the Squads multisig flow: vaultTransactionCreate →
 *      proposalCreate → proposalApprove (creator + memberSecrets[0]) →
 *      vaultTransactionExecute
 *   6. Prints before/after balances and the final tx signature
 *
 * Usage:
 *   # 1. Restore the leaked keypair file (gitignored — won't be re-committed)
 *   git show a8bff68:scripts/.demo-cofre-2ofn.json > scripts/.demo-cofre-2ofn.json
 *
 *   # 2. Drain everything to a fresh wallet you control
 *   pnpm tsx scripts/drain-leaked-demo-cofre.ts <DESTINATION_PUBKEY>
 *
 *   # Optional: leave a specific lamport buffer (default 5_000_000 = 0.005 SOL)
 *   pnpm tsx scripts/drain-leaked-demo-cofre.ts <DESTINATION_PUBKEY> --buffer 10000000
 *
 *   # 3. Clean up
 *   rm scripts/.demo-cofre-2ofn.json
 *
 * Pre-flight:
 *   - SOLANA_KEYPAIR (or ~/.config/solana/id.json) must hold the original
 *     creator wallet referenced in .demo-cofre-2ofn.json.creator. The script
 *     refuses to run if they don't match.
 *   - Creator wallet needs ~0.01 devnet SOL for fees (airdrop if needed:
 *     `solana airdrop 1 <CREATOR_PUBKEY> --url devnet`).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const { Multisig } = multisig.accounts;

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const DEMO_FILE = path.join(__dirname, ".demo-cofre-2ofn.json");
const DEFAULT_BUFFER_LAMPORTS = 5_000_000n; // 0.005 SOL safety buffer

type DemoCofre2ofN = {
  multisig: string;
  vault: string;
  cofre: string;
  creator: string;
  operator: string;
  createKey: number[];
  threshold: number;
  numMembers: number;
  memberSecrets: number[][];
  setupTx: string;
};

function loadKeypair(filePath?: string): Keypair {
  const candidates = filePath
    ? [filePath]
    : [
        path.join(os.homedir(), ".config/solana/id.json"),
        path.join(os.homedir(), ".config/solana/cloak-devnet.json"),
      ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf-8")) as number[]),
      );
    }
  }
  throw new Error(
    `Keypair not found at ${candidates.join(" or ")}. Set SOLANA_KEYPAIR or run scripts/import-phantom-key.mjs first.`,
  );
}

function parseArgs() {
  const argv = process.argv.slice(2);
  if (argv.length < 1) {
    throw new Error(
      "Usage:\n" +
        "  Dry-run (default — prints plan, no on-chain side effects):\n" +
        "    pnpm tsx scripts/drain-leaked-demo-cofre.ts <DESTINATION_PUBKEY>\n" +
        "  Execute (irreversible — moves funds on devnet):\n" +
        "    pnpm tsx scripts/drain-leaked-demo-cofre.ts <DESTINATION_PUBKEY> --confirm\n" +
        "  Optional flags:\n" +
        "    --buffer <lamports>   leave this much in the vault (default 5_000_000)",
    );
  }
  const destination = new PublicKey(argv[0]!);
  let buffer = DEFAULT_BUFFER_LAMPORTS;
  const bufferIdx = argv.indexOf("--buffer");
  if (bufferIdx !== -1) {
    const value = argv[bufferIdx + 1];
    if (!value) throw new Error("--buffer requires a value (lamports)");
    buffer = BigInt(value);
  }
  // Default to dry-run. Operator must opt in with --confirm to mutate on-chain
  // state. `--dry-run` is accepted as an explicit synonym for the default.
  const explicitDryRun = argv.includes("--dry-run");
  const confirm = argv.includes("--confirm");
  if (explicitDryRun && confirm) {
    throw new Error("Pass either --dry-run or --confirm, not both.");
  }
  const dryRun = !confirm;
  return { destination, buffer, dryRun };
}

async function confirm(connection: Connection, signature: string) {
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
}

async function main() {
  if (!fs.existsSync(DEMO_FILE)) {
    throw new Error(
      `Missing ${DEMO_FILE}. Restore it from git history:\n  git show a8bff68:scripts/.demo-cofre-2ofn.json > scripts/.demo-cofre-2ofn.json`,
    );
  }

  const { destination, buffer, dryRun } = parseArgs();
  const demo: DemoCofre2ofN = JSON.parse(fs.readFileSync(DEMO_FILE, "utf-8"));

  const multisigPda = new PublicKey(demo.multisig);
  const vaultPda = new PublicKey(demo.vault);

  const creator = loadKeypair(process.env.SOLANA_KEYPAIR);
  if (creator.publicKey.toBase58() !== demo.creator) {
    throw new Error(
      `Creator mismatch.\n  Loaded keypair: ${creator.publicKey.toBase58()}\n  Expected:       ${demo.creator}\n  Set SOLANA_KEYPAIR to the creator wallet referenced in .demo-cofre-2ofn.json.`,
    );
  }

  if (!demo.memberSecrets?.length) {
    throw new Error("memberSecrets[] missing in .demo-cofre-2ofn.json");
  }
  const member2 = Keypair.fromSecretKey(Uint8Array.from(demo.memberSecrets[0]!));

  console.log("=== EMERGENCY DRAIN — leaked demo-cofre-2ofn ===");
  console.log(
    "Mode:          ",
    dryRun ? "DRY-RUN (no on-chain writes)" : "EXECUTE (--confirm passed)",
  );
  console.log("RPC:           ", RPC_URL);
  console.log("Multisig PDA:  ", multisigPda.toBase58(), "(decommissioned)");
  console.log("Vault PDA:     ", vaultPda.toBase58());
  console.log("Destination:   ", destination.toBase58());
  console.log("Creator (you): ", creator.publicKey.toBase58());
  console.log("Member 2:      ", member2.publicKey.toBase58(), "(from exposed memberSecrets[0])");
  console.log("Buffer:        ", buffer.toString(), "lamports");

  const connection = new Connection(RPC_URL, "confirmed");

  const vaultBalance = BigInt(await connection.getBalance(vaultPda));
  console.log(
    `\nVault balance: ${vaultBalance} lamports (${Number(vaultBalance) / LAMPORTS_PER_SOL} SOL)`,
  );

  if (vaultBalance <= buffer) {
    console.log("Nothing to drain (balance <= buffer). Exiting.");
    return;
  }

  const drainAmount = vaultBalance - buffer;
  console.log(
    `Drain amount:  ${drainAmount} lamports (${Number(drainAmount) / LAMPORTS_PER_SOL} SOL)`,
  );

  const innerIx = SystemProgram.transfer({
    fromPubkey: vaultPda,
    toPubkey: destination,
    lamports: drainAmount,
  });

  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: [innerIx],
  });

  const multisigAccount = await Multisig.fromAccountAddress(connection, multisigPda);
  const transactionIndex = BigInt(multisigAccount.transactionIndex.toString()) + 1n;
  console.log(`\nNext transactionIndex: ${transactionIndex}`);

  if (dryRun) {
    console.log("\n=== DRY-RUN — would now execute 5 on-chain steps ===");
    console.log("[1] vaultTransactionCreate (transactionIndex =", transactionIndex.toString(), ")");
    console.log("[2] proposalCreate");
    console.log("[3] proposalApprove (creator)");
    console.log("[4] proposalApprove (member 2 from exposed key)");
    console.log("[5] vaultTransactionExecute");
    console.log(
      `\nTo actually drain ${drainAmount} lamports → ${destination.toBase58()}, re-run with --confirm:`,
    );
    console.log(
      `  pnpm tsx scripts/drain-leaked-demo-cofre.ts ${destination.toBase58()} --confirm`,
    );
    return;
  }

  console.log("\n[1] vaultTransactionCreate...");
  const createTxSig = await multisig.rpc.vaultTransactionCreate({
    connection,
    feePayer: creator,
    multisigPda,
    transactionIndex,
    creator: creator.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    memo: "emergency drain — leaked demo cofre decommission",
  });
  await confirm(connection, createTxSig);
  console.log("  tx:", createTxSig);

  console.log("\n[2] proposalCreate...");
  const proposalSig = await multisig.rpc.proposalCreate({
    connection,
    feePayer: creator,
    creator,
    multisigPda,
    transactionIndex,
  });
  await confirm(connection, proposalSig);
  console.log("  tx:", proposalSig);

  console.log("\n[3] proposalApprove (creator)...");
  const approveCreatorSig = await multisig.rpc.proposalApprove({
    connection,
    feePayer: creator,
    member: creator,
    multisigPda,
    transactionIndex,
  });
  await confirm(connection, approveCreatorSig);
  console.log("  tx:", approveCreatorSig);

  console.log("\n[4] proposalApprove (member 2 from exposed key)...");
  const approveMember2Sig = await multisig.rpc.proposalApprove({
    connection,
    feePayer: creator,
    member: member2,
    multisigPda,
    transactionIndex,
  });
  await confirm(connection, approveMember2Sig);
  console.log("  tx:", approveMember2Sig);

  console.log("\n[5] vaultTransactionExecute...");
  const executeSig = await multisig.rpc.vaultTransactionExecute({
    connection,
    feePayer: creator,
    multisigPda,
    transactionIndex,
    member: creator.publicKey,
    signers: [creator],
  });
  await confirm(connection, executeSig);
  console.log("  tx:", executeSig);

  const after = BigInt(await connection.getBalance(vaultPda));
  console.log("\n=== DRAINED ===");
  console.log(`Vault balance now: ${after} lamports (${Number(after) / LAMPORTS_PER_SOL} SOL)`);
  console.log(`Execute tx:        ${executeSig}`);
  console.log(`Explorer:          https://explorer.solana.com/tx/${executeSig}?cluster=devnet`);
  console.log("\nNext: rm scripts/.demo-cofre-2ofn.json");
}

main().catch((error) => {
  console.error("\n❌ Drain failed:", error);
  process.exit(1);
});
