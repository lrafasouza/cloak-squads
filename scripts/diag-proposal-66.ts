/**
 * Diagnose why a proposal's IssueLicense CPI fails ConstraintSeeds.
 *
 * Walks the VaultTransaction message of `<MULTISIG> tx #<INDEX>`, extracts
 * the encoded `license` account from the inner ix's account list, and
 * compares it against:
 *   (A) the NEW seed shape (post-F-001: [b"license", cofre, vault_index, payload_hash])
 *   (B) the OLD seed shape (pre-F-001:  [b"license", cofre, payload_hash])
 *
 * Whichever shape matches the encoded license account tells us which
 * version of the program the client was talking to when the proposal
 * was created.
 *
 * Usage:
 *   pnpm tsx scripts/diag-proposal-66.ts \
 *     --multisig 5hrqqkcaf7Xsx2gR7mFouBSXSGS1jtK1EGwV6NVnHpG2 \
 *     --tx 66
 */

import { Connection, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const GATEKEEPER = new PublicKey("AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq");

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function parseArgs(): { multisig: PublicKey; transactionIndex: bigint } {
  const m = arg("--multisig");
  const t = arg("--tx");
  if (!m || !t) {
    throw new Error("Usage: --multisig <PDA> --tx <index>");
  }
  return { multisig: new PublicKey(m), transactionIndex: BigInt(t) };
}

function cofrePda(multisigPda: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("cofre"), multisigPda.toBuffer()],
    GATEKEEPER,
  )[0];
}

function licensePdaNew(cofre: PublicKey, vaultIndex: number, payloadHash: Buffer): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("license"), cofre.toBuffer(), Buffer.from([vaultIndex]), payloadHash],
    GATEKEEPER,
  )[0];
}

function licensePdaOld(cofre: PublicKey, payloadHash: Buffer): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("license"), cofre.toBuffer(), payloadHash],
    GATEKEEPER,
  )[0];
}

// Anchor discriminator for `global:issue_license` = sha256("global:issue_license")[:8]
const ISSUE_LICENSE_DISC = Buffer.from([
  // computed offline: 0xb6, 0x4b, 0xb1, 0xc2, 0x14, 0x9a, 0xdb, 0x5d
  // We'll compute it at runtime instead for safety.
]);

async function anchorDisc(name: string): Promise<Buffer> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

async function main() {
  const { multisig: multisigPda, transactionIndex } = parseArgs();
  const connection = new Connection(RPC, "confirmed");

  console.log("=== Proposal diagnostic ===");
  console.log("Multisig:    ", multisigPda.toBase58());
  console.log("Tx index:    ", transactionIndex.toString());
  console.log("Gatekeeper:  ", GATEKEEPER.toBase58());
  console.log("RPC:         ", RPC);
  console.log();

  // Load the VaultTransaction account
  const [vaultTxPda] = multisig.getTransactionPda({
    multisigPda,
    index: transactionIndex,
  });
  console.log("VaultTransaction PDA:", vaultTxPda.toBase58());

  const vaultTx = await multisig.accounts.VaultTransaction.fromAccountAddress(
    connection,
    vaultTxPda,
  );

  console.log("Vault index in proposal:", vaultTx.vaultIndex);
  console.log("Inner ixs:              ", vaultTx.message.instructions.length);
  console.log();

  const issueDisc = await anchorDisc("issue_license");
  const cofre = cofrePda(multisigPda);
  console.log("Cofre PDA:", cofre.toBase58());
  console.log();

  for (let i = 0; i < vaultTx.message.instructions.length; i++) {
    const ix = vaultTx.message.instructions[i]!;
    const programKey = vaultTx.message.accountKeys[ix.programIdIndex]!;
    const data = Buffer.from(ix.data);
    const disc = data.subarray(0, 8);

    console.log(`--- Inner ix #${i} ---`);
    console.log("Program:      ", programKey.toBase58());
    console.log("Data length:  ", data.length);

    if (!programKey.equals(GATEKEEPER)) {
      console.log("(not gatekeeper — skipping)\n");
      continue;
    }
    if (!disc.equals(issueDisc)) {
      console.log("(not issue_license — disc =", disc.toString("hex"), ")\n");
      continue;
    }

    console.log("✓ This is issue_license");

    // Layout: [8 disc][32 payload_hash][16 nonce][8 ttl_secs][1 vault_index]
    const payloadHash = data.subarray(8, 8 + 32);
    const nonce = data.subarray(8 + 32, 8 + 32 + 16);
    const ttl = data.readBigInt64LE(8 + 32 + 16);
    const vaultIndexArg = data.readUInt8(8 + 32 + 16 + 8);

    console.log("Args:");
    console.log("  payload_hash:", payloadHash.toString("hex"));
    console.log("  nonce:       ", nonce.toString("hex"));
    console.log("  ttl_secs:    ", ttl.toString());
    console.log("  vault_index: ", vaultIndexArg);
    console.log();

    // Encoded license account from the ix's account list
    // For issue_license, accounts are: [cofre, squads_vault, license, payer, system_program]
    const accountIndices = Buffer.from(ix.accountIndexes);
    console.log("Account indices:", Array.from(accountIndices));

    const encodedLicense = vaultTx.message.accountKeys[accountIndices[2]!]!;
    console.log("Encoded license: ", encodedLicense.toBase58());
    console.log();

    const newPda = licensePdaNew(cofre, vaultIndexArg, payloadHash);
    const oldPda = licensePdaOld(cofre, payloadHash);

    console.log("=== Derivation comparison ===");
    console.log("NEW seeds (post-F-001): ", newPda.toBase58());
    console.log("OLD seeds (pre-F-001):  ", oldPda.toBase58());
    console.log();

    if (encodedLicense.equals(newPda)) {
      console.log("✅ Encoded license matches NEW seeds.");
      console.log("   → Client encoded with the new schema.");
      console.log("   → If on-chain execute STILL fails ConstraintSeeds, the deployed");
      console.log("     program is OLD and needs redeploy of the F-001 fix.");
    } else if (encodedLicense.equals(oldPda)) {
      console.log("⚠  Encoded license matches OLD seeds (pre-F-001).");
      console.log("   → The client running in the browser is stale.");
      console.log("   → Hard-refresh (Cmd+Shift+R), cancel this proposal, recreate.");
    } else {
      console.log("❌ Encoded license matches NEITHER schema.");
      console.log("   → Something stranger is going on. Investigate further.");
    }
  }
}

main().catch((err) => {
  console.error("\n❌ Diagnostic failed:", err);
  process.exit(1);
});
