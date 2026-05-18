/**
 * F-002 — Set up a 2-of-2 Squads V4 governance multisig on devnet whose
 * vault[0] will own the gatekeeper program's upgrade authority.
 *
 * Flow:
 *   1. Member A = current upgrade authority (~/.config/solana/cloak-devnet.json)
 *   2. Member B = newly generated "cold" key (saved to
 *      ~/.config/solana/aegis-governance-cold.json; user must move offline
 *      after this run)
 *   3. createKey is ephemeral (never persisted to disk) — lesson from the
 *      demo-cofre-2ofn leak incident.
 *   4. Multisig created on-chain, vault[0] funded, smoke-test proposal:
 *      vault[0] → member-A 0-lamport SystemTransfer, 2/2 approves, executes.
 *      This proves the multisig is real and signable before we point the
 *      gatekeeper's upgrade authority at it.
 *
 * Output: prints the vault[0] PDA. That is the address you'll pass to
 *   `solana program set-upgrade-authority --new-upgrade-authority ...`.
 *
 * Usage:
 *   pnpm tsx scripts/setup-governance-multisig.ts
 *
 * Safety:
 *   - This script does NOT call `solana program set-upgrade-authority`.
 *     That is a separate manual step you run only after this script
 *     succeeds and you've physically backed up the cold key.
 *   - The cold key path is gitignored only by virtue of being outside the
 *     repo (~/.config/solana). Do NOT move it into the repo tree.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  type PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const { Permission, Permissions } = multisig.types;
const { Multisig, ProgramConfig } = multisig.accounts;

const GATEKEEPER_PROGRAM_ID = "AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq";
const HOT_KEY_PATH = path.join(os.homedir(), ".config/solana/cloak-devnet.json");
const COLD_KEY_PATH = path.join(os.homedir(), ".config/solana/aegis-governance-cold.json");

function loadKeypair(filePath: string): Keypair {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Keypair not found at ${filePath}`);
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf-8")) as number[]),
  );
}

function writeKeypair(filePath: string, kp: Keypair) {
  fs.writeFileSync(filePath, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
}

async function confirm(connection: Connection, signature: string) {
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
}

async function airdropIfNeeded(connection: Connection, pubkey: PublicKey, minSol = 0.5) {
  const balance = await connection.getBalance(pubkey);
  if (balance < minSol * LAMPORTS_PER_SOL) {
    try {
      const sig = await connection.requestAirdrop(pubkey, 1 * LAMPORTS_PER_SOL);
      await confirm(connection, sig);
      console.log(`  airdropped 1 SOL to ${pubkey.toBase58().slice(0, 8)}...`);
    } catch {
      console.log(
        `  airdrop failed for ${pubkey.toBase58().slice(0, 8)}... (may need manual funding via faucet)`,
      );
    }
  }
}

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  // Member A — current upgrade authority.
  const hotKey = loadKeypair(HOT_KEY_PATH);

  // Member B — generate fresh cold key. Refuse to overwrite if one exists,
  // to avoid silently destroying a key the user might already be using.
  let coldKey: Keypair;
  if (fs.existsSync(COLD_KEY_PATH)) {
    console.log(`Cold key already exists at ${COLD_KEY_PATH} — reusing.`);
    coldKey = loadKeypair(COLD_KEY_PATH);
  } else {
    coldKey = Keypair.generate();
    writeKeypair(COLD_KEY_PATH, coldKey);
    console.log(`Generated cold key at ${COLD_KEY_PATH} (mode 0600)`);
  }

  const createKey = Keypair.generate(); // ephemeral — never persisted
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });

  console.log("\n=== F-002 governance multisig (2-of-2, devnet) ===");
  console.log("Hot member (A): ", hotKey.publicKey.toBase58(), "  (current upgrade authority)");
  console.log("Cold member (B):", coldKey.publicKey.toBase58(), "  (move offline after this run)");
  console.log("Multisig PDA:   ", multisigPda.toBase58());
  console.log(
    "Vault[0] PDA:   ",
    vaultPda.toBase58(),
    "  <-- this becomes the new upgrade authority",
  );

  // Fund members so they can sign approvals if they ever pay their own fees
  console.log("\n[0] Funding members if needed...");
  await airdropIfNeeded(connection, hotKey.publicKey, 1);
  await airdropIfNeeded(connection, coldKey.publicKey, 0.5);

  const hotBalance = await connection.getBalance(hotKey.publicKey);
  console.log(`  hot balance: ${hotBalance / LAMPORTS_PER_SOL} SOL`);
  if (hotBalance < 1 * LAMPORTS_PER_SOL) {
    throw new Error("Hot key needs >= 1 SOL for multisig setup + tests");
  }

  const memberPermissions = Permissions.fromPermissions([
    Permission.Initiate,
    Permission.Vote,
    Permission.Execute,
  ]);

  const [programConfigPda] = multisig.getProgramConfigPda({});
  const programConfig = await ProgramConfig.fromAccountAddress(connection, programConfigPda);
  const treasury = programConfig.treasury;

  console.log("\n[1/6] multisigCreateV2 (2-of-2)...");
  const createSig = await multisig.rpc.multisigCreateV2({
    connection,
    treasury,
    createKey,
    creator: hotKey,
    multisigPda,
    configAuthority: null,
    threshold: 2,
    members: [
      { key: hotKey.publicKey, permissions: memberPermissions },
      { key: coldKey.publicKey, permissions: memberPermissions },
    ],
    timeLock: 0,
    rentCollector: null,
    memo: "aegis F-002 governance multisig (2-of-2)",
  });
  await confirm(connection, createSig);
  console.log("  tx:", createSig);

  // Fund vault[0] so it can pay its own approval test
  console.log("\n[2/6] Fund vault[0] with 0.05 SOL for the test proposal...");
  const fundVaultSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: hotKey.publicKey,
        toPubkey: vaultPda,
        lamports: 50_000_000, // 0.05 SOL — enough for rent + tiny transfers
      }),
    ),
    [hotKey],
    { commitment: "confirmed" },
  );
  console.log("  tx:", fundVaultSig);

  // === Smoke test ===
  // Submit a no-op-ish proposal: vault[0] -> hot member, 1 lamport.
  // If 2-of-2 approves and executes, the multisig is provably signable.
  const multisigAccount = await Multisig.fromAccountAddress(connection, multisigPda);
  const transactionIndex = BigInt(multisigAccount.transactionIndex.toString()) + 1n;

  const innerIx = SystemProgram.transfer({
    fromPubkey: vaultPda,
    toPubkey: hotKey.publicKey,
    lamports: 1,
  });
  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: [innerIx],
  });

  console.log("\n[3/6] vaultTransactionCreate (smoke-test: vault->hot 1 lamport)...");
  const createTxSig = await multisig.rpc.vaultTransactionCreate({
    connection,
    feePayer: hotKey,
    multisigPda,
    transactionIndex,
    creator: hotKey.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    memo: "F-002 smoke test",
  });
  await confirm(connection, createTxSig);
  console.log("  tx:", createTxSig);

  console.log("\n[4/6] proposalCreate...");
  const proposalSig = await multisig.rpc.proposalCreate({
    connection,
    feePayer: hotKey,
    creator: hotKey,
    multisigPda,
    transactionIndex,
  });
  await confirm(connection, proposalSig);
  console.log("  tx:", proposalSig);

  console.log("\n[5/6] Approvals — both members must sign (threshold=2/2)...");
  for (const [label, member] of [
    ["hot", hotKey],
    ["cold", coldKey],
  ] as const) {
    const approveSig = await multisig.rpc.proposalApprove({
      connection,
      feePayer: hotKey,
      member,
      multisigPda,
      transactionIndex,
    });
    await confirm(connection, approveSig);
    console.log(`  approve(${label}):`, approveSig);
  }

  console.log("\n[6/6] vaultTransactionExecute (smoke-test executes)...");
  const executeSig = await multisig.rpc.vaultTransactionExecute({
    connection,
    feePayer: hotKey,
    multisigPda,
    transactionIndex,
    member: hotKey.publicKey,
    signers: [hotKey],
  });
  await confirm(connection, executeSig);
  console.log("  tx:", executeSig);

  console.log("\n=== ✅ Smoke test passed — multisig is real and signable ===");
  console.log("\nNext steps (manual):");
  console.log("");
  console.log("  1. Back up the cold key off this machine:");
  console.log(`       cat ${COLD_KEY_PATH}`);
  console.log("       # save the array to a password manager / hardware backup");
  console.log(`       # then: shred -u ${COLD_KEY_PATH}  (after the migration below)`);
  console.log("");
  console.log("  2. Migrate the gatekeeper upgrade authority to vault[0]:");
  console.log(`       solana program set-upgrade-authority ${GATEKEEPER_PROGRAM_ID} \\`);
  console.log(`         --new-upgrade-authority ${vaultPda.toBase58()} \\`);
  console.log(`         --keypair ${HOT_KEY_PATH} \\`);
  console.log("         --url https://api.devnet.solana.com");
  console.log("");
  console.log("  3. Verify:");
  console.log(`       solana program show ${GATEKEEPER_PROGRAM_ID} \\`);
  console.log("         --url https://api.devnet.solana.com \\");
  console.log(`         -k ${HOT_KEY_PATH}`);
  console.log(`       # Authority: ${vaultPda.toBase58()} ✅`);
  console.log("");
  console.log("  4. Record the new authority in docs/security/governance.md");
  console.log("");
  console.log(`MULTISIG_ADDRESS=${multisigPda.toBase58()}`);
  console.log(`VAULT_ADDRESS=${vaultPda.toBase58()}`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
