/**
 * Build a Squads vault transaction that upgrades the gatekeeper program
 * to a previously-uploaded buffer.
 *
 * Why this exists: when the gatekeeper program's upgrade authority is a
 * Squads vault PDA (governance setup post F-002), `solana program deploy`
 * can't sign the upgrade directly — the authority has no keypair. The
 * canonical flow is:
 *
 *   1. Build the new program locally:
 *        anchor build -p cloak-gatekeeper
 *      (produces target/deploy/cloak_gatekeeper.so)
 *
 *   2. Upload as a buffer (user-signed; fast via solana CLI):
 *        solana program write-buffer target/deploy/cloak_gatekeeper.so \
 *          --url devnet --keypair ~/.config/solana/cloak-devnet.json
 *      Returns BUFFER_PUBKEY (32-byte base58).
 *
 *   3. Transfer buffer authority to the Squads vault:
 *        solana program set-buffer-authority BUFFER_PUBKEY \
 *          --new-buffer-authority 5RfeUxpeQFNRgs8bC6UyfYfVfFpFXUxjcq3FwmGuxZEN \
 *          --url devnet --keypair ~/.config/solana/cloak-devnet.json
 *
 *   4. This script: builds the Squads vaultTransactionCreate + proposalCreate
 *      pair that, once approved and executed, runs the BPFLoaderUpgradeable
 *      Upgrade instruction. Outputs the transactionIndex.
 *
 *   5. Approve via Squads UI (squads.so) — needs the multisig threshold.
 *
 *   6. Execute via Squads UI. The on-chain BPFLoaderUpgradeable Upgrade
 *      runs, the new .so replaces the old, and the program is live.
 *
 * Usage:
 *   pnpm tsx scripts/redeploy-gatekeeper-via-squads.ts \
 *     --buffer <BUFFER_PUBKEY> \
 *     --governance-multisig <SQUADS_MULTISIG_PDA>
 *
 * The script defaults to AEGIS_RPC env or devnet, and uses
 * SOLANA_KEYPAIR / ~/.config/solana/cloak-devnet.json as the proposer +
 * fee payer (the proposer wallet must be a member of the governance
 * multisig — it pays rent + fees but its approval still counts as one
 * of the 2 needed).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
  TransactionMessage,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const { Multisig } = multisig.accounts;

const GATEKEEPER_PROGRAM_ID = new PublicKey("AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq");
const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const RPC = process.env.AEGIS_RPC ?? "https://api.devnet.solana.com";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf-8")) as number[]),
  );
}

/**
 * BPFLoaderUpgradeable Upgrade instruction (variant 3).
 * https://docs.rs/solana-program/latest/solana_program/loader_upgradeable_instruction/enum.UpgradeableLoaderInstruction.html
 *
 * Accounts (in this order):
 *   0. [writable]            ProgramData account (PDA of program ID under loader)
 *   1. [writable]            Program account (the program ID)
 *   2. [writable]            Buffer account (carries the new code)
 *   3. [writable]            Spill account (receives leftover lamports — anywhere)
 *   4. []                    Rent sysvar
 *   5. []                    Clock sysvar
 *   6. [signer]              Upgrade authority (here: the Squads vault PDA — Squads program signs as PDA)
 *
 * Data: [u32 variant_id=3]   (just the 4-byte tag, no args)
 */
function buildUpgradeIx(params: {
  programData: PublicKey;
  program: PublicKey;
  buffer: PublicKey;
  spill: PublicKey;
  upgradeAuthority: PublicKey;
}): TransactionInstruction {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(3, 0); // Upgrade variant
  return new TransactionInstruction({
    programId: BPF_LOADER_UPGRADEABLE,
    keys: [
      { pubkey: params.programData, isSigner: false, isWritable: true },
      { pubkey: params.program, isSigner: false, isWritable: true },
      { pubkey: params.buffer, isSigner: false, isWritable: true },
      { pubkey: params.spill, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: params.upgradeAuthority, isSigner: true, isWritable: false },
    ],
    data,
  });
}

async function main() {
  const bufferArg = arg("--buffer");
  const multisigArg = arg("--governance-multisig");
  const dryRun = !process.argv.includes("--confirm");

  if (!bufferArg || !multisigArg) {
    throw new Error(
      "Usage:\n" +
        "  Dry-run (default — prints plan):\n" +
        "    pnpm tsx scripts/redeploy-gatekeeper-via-squads.ts \\\n" +
        "      --buffer <BUFFER_PUBKEY> \\\n" +
        "      --governance-multisig <SQUADS_MULTISIG_PDA>\n" +
        "  Execute (creates proposal on-chain):\n" +
        "    ... --confirm",
    );
  }

  const bufferPubkey = new PublicKey(bufferArg);
  const governanceMultisig = new PublicKey(multisigArg);

  const keypairPath =
    process.env.SOLANA_KEYPAIR ?? path.join(os.homedir(), ".config/solana/cloak-devnet.json");
  if (!fs.existsSync(keypairPath)) {
    throw new Error(`Proposer keypair not found at ${keypairPath}. Set SOLANA_KEYPAIR.`);
  }
  const proposer = loadKeypair(keypairPath);

  const connection = new Connection(RPC, "confirmed");

  // Derive the upgrade authority (governance Squads vault[0]).
  const [governanceVault] = multisig.getVaultPda({
    multisigPda: governanceMultisig,
    index: 0,
  });

  // Derive the ProgramData PDA owned by the upgradeable loader.
  const [programData] = PublicKey.findProgramAddressSync(
    [GATEKEEPER_PROGRAM_ID.toBuffer()],
    BPF_LOADER_UPGRADEABLE,
  );

  // Verify the buffer exists and confirm its authority is the Squads vault.
  const bufferInfo = await connection.getAccountInfo(bufferPubkey);
  if (!bufferInfo) {
    throw new Error(`Buffer ${bufferPubkey.toBase58()} not found on ${RPC}.`);
  }
  if (!bufferInfo.owner.equals(BPF_LOADER_UPGRADEABLE)) {
    throw new Error(`Buffer ${bufferPubkey.toBase58()} is not owned by the upgradeable loader.`);
  }
  // Buffer layout: [u32 tag=1][option<pubkey> authority] — tag 1=2 means present.
  const bufferTag = bufferInfo.data.readUInt32LE(0);
  if (bufferTag !== 1) {
    throw new Error(`Buffer ${bufferPubkey.toBase58()} variant tag ${bufferTag}, expected 1.`);
  }
  const bufferHasAuth = bufferInfo.data.readUInt8(4);
  if (bufferHasAuth !== 1) {
    throw new Error("Buffer has no authority — already immutable, cannot use for upgrade.");
  }
  const bufferAuth = new PublicKey(bufferInfo.data.subarray(5, 37));
  if (!bufferAuth.equals(governanceVault)) {
    throw new Error(
      `Buffer authority is ${bufferAuth.toBase58()}, must be the Squads vault ${governanceVault.toBase58()}.\n` +
        `Run: solana program set-buffer-authority ${bufferPubkey.toBase58()} \\\n` +
        `       --new-buffer-authority ${governanceVault.toBase58()} \\\n` +
        `       --url ${RPC}`,
    );
  }

  const upgradeIx = buildUpgradeIx({
    programData,
    program: GATEKEEPER_PROGRAM_ID,
    buffer: bufferPubkey,
    spill: proposer.publicKey, // leftover lamports → proposer (refunded)
    upgradeAuthority: governanceVault,
  });

  console.log("=== Gatekeeper redeploy via Squads governance ===");
  console.log("Mode:                ", dryRun ? "DRY-RUN" : "EXECUTE (--confirm)");
  console.log("RPC:                 ", RPC);
  console.log("Gatekeeper program:  ", GATEKEEPER_PROGRAM_ID.toBase58());
  console.log("Program data PDA:    ", programData.toBase58());
  console.log("Buffer:              ", bufferPubkey.toBase58());
  console.log("Governance multisig: ", governanceMultisig.toBase58());
  console.log("Governance vault[0]: ", governanceVault.toBase58(), "(upgrade authority)");
  console.log("Proposer / fee payer:", proposer.publicKey.toBase58());
  console.log();

  // Build the TransactionMessage that wraps the upgrade ix.
  const message = new TransactionMessage({
    payerKey: governanceVault,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: [upgradeIx],
  });

  // Next vault transaction index for the governance multisig.
  const multisigAccount = await Multisig.fromAccountAddress(connection, governanceMultisig);
  const nextIndex = BigInt(multisigAccount.transactionIndex.toString()) + 1n;
  console.log("Next transactionIndex:", nextIndex.toString());
  console.log();

  if (dryRun) {
    console.log("=== DRY-RUN — would now execute 2 on-chain steps ===");
    console.log("[1] vaultTransactionCreate (wraps BPFLoader.Upgrade)");
    console.log("[2] proposalCreate");
    console.log("\nAfter this script, the multisig members approve + execute in the Squads UI.");
    console.log("Re-run with --confirm to create the proposal on-chain.");
    return;
  }

  console.log("[1/2] vaultTransactionCreate...");
  const createSig = await multisig.rpc.vaultTransactionCreate({
    connection,
    feePayer: proposer,
    multisigPda: governanceMultisig,
    transactionIndex: nextIndex,
    creator: proposer.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    memo: "gatekeeper upgrade — F-001 + F-003 audit fixes",
  });
  console.log("  tx:", createSig);

  // Confirm the create before issuing proposalCreate (Squads SDK is async).
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: createSig, ...latest }, "confirmed");

  console.log("[2/2] proposalCreate...");
  const proposalSig = await multisig.rpc.proposalCreate({
    connection,
    feePayer: proposer,
    creator: proposer,
    multisigPda: governanceMultisig,
    transactionIndex: nextIndex,
  });
  console.log("  tx:", proposalSig);

  console.log("\n✅ Squads upgrade proposal created.");
  console.log(`   Transaction index: ${nextIndex}`);
  console.log(`   Multisig:          ${governanceMultisig.toBase58()}`);
  console.log("\nNext: open https://v4.squads.so/, switch to the governance multisig,");
  console.log("find this transaction, approve with 2-of-2 members, then execute.");
  console.log("After execute, the gatekeeper at AgFx8yS8... runs the new bytecode.");
}

main().catch((err) => {
  console.error("\n❌ Redeploy preparation failed:", err);
  process.exit(1);
});
