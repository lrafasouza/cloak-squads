/**
 * F-501 (audit Pass 5) — Mainnet variant of `scripts/setup-governance-multisig.ts`.
 *
 * Differences from devnet:
 *   - 2-of-3 threshold (instead of 2-of-2). Bigger surface of "no single key
 *     can move alone" while still tolerating one key loss.
 *   - Member C is a HARDWARE WALLET (Ledger). The script does not generate it;
 *     you connect the device and feed the pubkey via env or arg.
 *   - Member B (offline software cold) is generated locally but the script
 *     stops short of writing it to ~/.config/solana — instead it prints the
 *     keypair and tells you to back it up directly to a hardware-encrypted
 *     storage (Bitwarden/1Password attachment, paper backup, USB stick that
 *     stays offline). No on-disk copy means no rogue process to read it.
 *   - Uses mainnet-beta RPC (no airdrops). Pre-funding required.
 *   - timeLock = 86400s (24h) — gives a window to abort a malicious upgrade
 *     before it executes.
 *   - Smoke test still runs (vault -> hot 1 lamport, 2/3 approves). On
 *     mainnet a "1 lamport" smoke costs real SOL; that's the price of
 *     proving the multisig is signable before pointing program authority
 *     at it.
 *
 * Usage:
 *   AEGIS_LEDGER_PUBKEY=<your-ledger-pubkey> \
 *   AEGIS_RPC=https://api.mainnet-beta.solana.com \
 *   pnpm tsx scripts/setup-mainnet-governance.ts
 *
 * Pre-conditions:
 *   - You have a deployer key at ~/.config/solana/cloak-mainnet.json
 *     (this is the current upgrade authority on mainnet, OR a fresh key
 *     you'll use to deploy mainnet). The script assumes this key is
 *     funded with at least 1 SOL for multisig creation rent + tests.
 *   - You have a Ledger or other hardware wallet generated outside this
 *     machine. Provide the pubkey via AEGIS_LEDGER_PUBKEY env.
 *   - You have read SOLANA's set-upgrade-authority guide for hardware
 *     signers if you intend to migrate an existing program.
 *
 * What this script does NOT do:
 *   - Does NOT migrate the gatekeeper upgrade authority. After this
 *     script succeeds, run `solana program set-upgrade-authority` against
 *     the printed vault[0] PDA (the `--skip-new-upgrade-authority-signer-check`
 *     flag is required for PDA destinations).
 *   - Does NOT enroll the Ledger as a Squads signer beyond using its
 *     pubkey. The Ledger holder must approve future proposals via the
 *     Squads UI (https://squads.so/) with their device connected.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const { Permission, Permissions } = multisig.types;
const { Multisig, ProgramConfig } = multisig.accounts;

const GATEKEEPER_PROGRAM_ID = "AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq";
const HOT_KEY_PATH = path.join(os.homedir(), ".config/solana/cloak-mainnet.json");
const RPC_URL = process.env.AEGIS_RPC ?? "https://api.mainnet-beta.solana.com";
const TIME_LOCK_SECS = 86400; // 24h

function loadKeypair(filePath: string): Keypair {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Keypair not found at ${filePath}. ` +
        `For mainnet, create a dedicated deployer key (NOT your daily-driver wallet).`,
    );
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf-8")) as number[]),
  );
}

async function confirm(connection: Connection, signature: string) {
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
}

async function main() {
  if (RPC_URL.includes("devnet")) {
    throw new Error(
      "AEGIS_RPC points at devnet but this is the MAINNET script. " +
        "Use scripts/setup-governance-multisig.ts for devnet.",
    );
  }

  const ledgerPubkeyStr = process.env.AEGIS_LEDGER_PUBKEY;
  if (!ledgerPubkeyStr) {
    throw new Error(
      "AEGIS_LEDGER_PUBKEY env var is required. Connect your hardware wallet, " +
        "read its pubkey, and re-run with AEGIS_LEDGER_PUBKEY=<pubkey>.",
    );
  }
  let ledgerPubkey: PublicKey;
  try {
    ledgerPubkey = new PublicKey(ledgerPubkeyStr);
  } catch {
    throw new Error(`AEGIS_LEDGER_PUBKEY is not a valid pubkey: ${ledgerPubkeyStr}`);
  }

  const connection = new Connection(RPC_URL, "confirmed");

  // Member A — hot deployer key.
  const hotKey = loadKeypair(HOT_KEY_PATH);

  // Member B — offline cold key. Generated in memory; printed once for
  // out-of-band backup; NEVER written to disk by this script.
  const coldKey = Keypair.generate();

  // Member C — hardware wallet. Pubkey only.
  const ledgerMember = ledgerPubkey;

  const createKey = Keypair.generate(); // ephemeral — never persisted
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });

  console.log("\n=== F-501 MAINNET governance multisig (2-of-3) ===\n");
  console.log("RPC:                ", RPC_URL);
  console.log("Hot member (A):     ", hotKey.publicKey.toBase58(), "  (existing deployer key)");
  console.log("Cold member (B):    ", coldKey.publicKey.toBase58(), "  (in-memory only — see below)");
  console.log("Hardware (C):       ", ledgerMember.toBase58(), "  (Ledger / external signer)");
  console.log("Multisig PDA:       ", multisigPda.toBase58());
  console.log("Vault[0] PDA:       ", vaultPda.toBase58(), "  <-- new upgrade authority");
  console.log("Threshold:          ", "2 of 3");
  console.log("Time-lock:          ", `${TIME_LOCK_SECS}s (24h)`);
  console.log();

  console.log("════════════════════════════════════════════════════════════════════════════");
  console.log(" BACKUP THE COLD KEY NOW. The next step writes nothing to disk.");
  console.log(" Copy the array below to your password manager + paper backup.");
  console.log("════════════════════════════════════════════════════════════════════════════");
  console.log("Cold key seed (Uint8Array, 64 bytes):");
  console.log(JSON.stringify(Array.from(coldKey.secretKey)));
  console.log("════════════════════════════════════════════════════════════════════════════\n");

  const hotBalance = await connection.getBalance(hotKey.publicKey);
  console.log(`Hot balance: ${hotBalance / LAMPORTS_PER_SOL} SOL`);
  if (hotBalance < 0.05 * LAMPORTS_PER_SOL) {
    throw new Error(
      `Hot key needs at least 0.05 SOL for multisig creation rent + smoke test on mainnet. ` +
        `Send funds to ${hotKey.publicKey.toBase58()} and re-run.`,
    );
  }

  const memberPermissions = Permissions.fromPermissions([
    Permission.Initiate,
    Permission.Vote,
    Permission.Execute,
  ]);

  const [programConfigPda] = multisig.getProgramConfigPda({});
  const programConfig = await ProgramConfig.fromAccountAddress(connection, programConfigPda);
  const treasury = programConfig.treasury;

  console.log("[1/6] multisigCreateV2 (2-of-3, 24h time-lock)...");
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
      { key: ledgerMember, permissions: memberPermissions },
    ],
    timeLock: TIME_LOCK_SECS,
    rentCollector: null,
    memo: "aegis F-501 mainnet governance multisig (2-of-3, 24h time-lock)",
  });
  await confirm(connection, createSig);
  console.log("  tx:", createSig);

  console.log("\n[2/6] Fund vault[0] with 0.01 SOL for the smoke test...");
  const fundVaultSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: hotKey.publicKey,
        toPubkey: vaultPda,
        lamports: 10_000_000,
      }),
    ),
    [hotKey],
    { commitment: "confirmed" },
  );
  console.log("  tx:", fundVaultSig);

  // Smoke test using hot + cold (skip Ledger to avoid requiring device
  // connection here; the Ledger holder will exercise their key on the
  // first real proposal via the Squads UI).
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

  console.log("\n[3/6] vaultTransactionCreate (smoke-test: vault -> hot 1 lamport)...");
  const createTxSig = await multisig.rpc.vaultTransactionCreate({
    connection,
    feePayer: hotKey,
    multisigPda,
    transactionIndex,
    creator: hotKey.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    memo: "F-501 mainnet smoke test (hot + cold approval)",
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

  console.log("\n[5/6] Approvals — hot + cold (Ledger sits this test out)...");
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

  console.log("\n[6/6] vaultTransactionExecute...");
  console.log(
    `  Note: with timeLock=${TIME_LOCK_SECS}s, execute will fail until ${TIME_LOCK_SECS}s elapse.`,
  );
  console.log("  Re-run vaultTransactionExecute after the lock window if this step rejects.");
  try {
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
  } catch (err) {
    console.log("  expected: time-lock not elapsed yet. Smoke proposal is queued.");
    console.log("  err:", err instanceof Error ? err.message : String(err));
  }

  console.log("\n=== ✅ Multisig provisioned ===\n");
  console.log("Next steps:");
  console.log();
  console.log("  1. Confirm the cold key array is backed up out-of-band.");
  console.log("     Wipe the terminal scrollback after backup.");
  console.log();
  console.log("  2. After the 24h time-lock elapses, re-execute the smoke proposal");
  console.log("     to fully exercise the threshold. The Ledger holder should join");
  console.log("     this round via the Squads UI to validate their key works.");
  console.log();
  console.log("  3. Migrate the gatekeeper upgrade authority (one-shot, signed by");
  console.log("     the CURRENT upgrade authority on mainnet — NOT the new vault PDA):");
  console.log();
  console.log(
    `       solana program set-upgrade-authority ${GATEKEEPER_PROGRAM_ID} \\`,
  );
  console.log(`         --new-upgrade-authority ${vaultPda.toBase58()} \\`);
  console.log("         --skip-new-upgrade-authority-signer-check \\");
  console.log(`         --keypair <path-to-current-mainnet-upgrade-authority> \\`);
  console.log(`         --url ${RPC_URL}`);
  console.log();
  console.log("  4. Verify:");
  console.log(
    `       solana program show ${GATEKEEPER_PROGRAM_ID} --url ${RPC_URL} -k ${HOT_KEY_PATH}`,
  );
  console.log(`       # Authority should be: ${vaultPda.toBase58()}`);
  console.log();
  console.log("  5. Update docs/security/governance.md with the new mainnet authority.");
  console.log();
  console.log("MULTISIG_ADDRESS=" + multisigPda.toBase58());
  console.log("VAULT_ADDRESS=" + vaultPda.toBase58());
  console.log("LEDGER_MEMBER=" + ledgerMember.toBase58());
  console.log("HOT_MEMBER=" + hotKey.publicKey.toBase58());
  console.log("COLD_MEMBER=" + coldKey.publicKey.toBase58());
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
