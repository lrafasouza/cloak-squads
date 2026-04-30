/**
 * Creates a fresh N-of-M Squads multisig + Cofre on devnet with multiple members.
 *
 * Usage:
 *   pnpm tsx scripts/setup-demo-cofre-2ofn.ts <threshold> <num-members> <operator-pubkey>
 *   pnpm tsx scripts/setup-demo-cofre-2ofn.ts 2 3 <operator-pubkey>   # 2-of-3 (default if omitted)
 *
 * Member keypairs are generated, funded by the creator, and saved to
 * .demo-cofre-2ofn.json alongside the multisig PDA so follow-up scripts
 * (test-f1-private-send-2ofn.ts) can sign approvals with the correct keys.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const { Permission, Permissions } = multisig.types;
const { Multisig, ProgramConfig } = multisig.accounts;

const GATEKEEPER_PROGRAM_ID = new PublicKey("AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_FILE = path.join(__dirname, ".demo-cofre-2ofn.json");

function loadKeypair(filePath?: string) {
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
    `Keypair not found at ${candidates.join(" or ")}. Set SOLANA_KEYPAIR env var or run node scripts/import-phantom-key.mjs first.`,
  );
}

async function confirm(connection: Connection, signature: string) {
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
}

function ixDiscriminator(name: string) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function buildInitCofreIx(opts: {
  cofre: PublicKey;
  vaultPda: PublicKey;
  multisig: PublicKey;
  operator: PublicKey;
  viewKeyPublic: Uint8Array;
}): TransactionInstruction {
  const data = Buffer.concat([
    ixDiscriminator("init_cofre"),
    opts.multisig.toBuffer(),
    opts.operator.toBuffer(),
    Buffer.from(opts.viewKeyPublic),
  ]);
  return new TransactionInstruction({
    programId: GATEKEEPER_PROGRAM_ID,
    keys: [
      { pubkey: opts.cofre, isSigner: false, isWritable: true },
      { pubkey: opts.vaultPda, isSigner: true, isWritable: false },
      { pubkey: opts.vaultPda, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function airdropIfNeeded(connection: Connection, pubkey: PublicKey, minSol = 0.5) {
  const balance = await connection.getBalance(pubkey);
  if (balance < minSol * LAMPORTS_PER_SOL) {
    try {
      const sig = await connection.requestAirdrop(pubkey, 1 * LAMPORTS_PER_SOL);
      await confirm(connection, sig);
      console.log(`  Airdropped 1 SOL to ${pubkey.toBase58().slice(0, 8)}...`);
    } catch {
      console.log(`  Airdrop failed for ${pubkey.toBase58().slice(0, 8)}... (may need manual funding)`);
    }
  }
}

function readArgs(): { threshold: number; numMembers: number; operator: PublicKey } {
  const thresholdArg = process.argv[2] ?? "2";
  const numMembersArg = process.argv[3] ?? "3";
  const operatorArg = process.argv[4];

  const threshold = Number.parseInt(thresholdArg, 10);
  const numMembers = Number.parseInt(numMembersArg, 10);

  if (Number.isNaN(threshold) || threshold < 1) {
    throw new Error("Invalid threshold. Usage: pnpm tsx scripts/setup-demo-cofre-2ofn.ts <threshold> <num-members> <operator-pubkey>");
  }
  if (Number.isNaN(numMembers) || numMembers < threshold) {
    throw new Error("num-members must be >= threshold. Usage: pnpm tsx scripts/setup-demo-cofre-2ofn.ts <threshold> <num-members> <operator-pubkey>");
  }
  if (!operatorArg) {
    throw new Error("Missing operator pubkey. Usage: pnpm tsx scripts/setup-demo-cofre-2ofn.ts <threshold> <num-members> <operator-pubkey>");
  }

  let operator: PublicKey;
  try {
    operator = new PublicKey(operatorArg);
  } catch {
    throw new Error(`Invalid operator pubkey: ${operatorArg}`);
  }

  return { threshold, numMembers, operator };
}

async function main() {
  const { threshold, numMembers, operator } = readArgs();

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const creator = loadKeypair(process.env.SOLANA_KEYPAIR);

  // Generate additional members
  const extraMembers: Keypair[] = [];
  for (let i = 0; i < numMembers - 1; i++) {
    extraMembers.push(Keypair.generate());
  }

  const allMembers = [creator, ...extraMembers];
  const createKey = Keypair.generate();

  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
  const [cofrePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("cofre"), multisigPda.toBuffer()],
    GATEKEEPER_PROGRAM_ID,
  );

  console.log(`=== Cloak-Squads ${threshold}-of-${numMembers} Demo Cofre (devnet) ===`);
  console.log("Creator (you): ", creator.publicKey.toBase58());
  for (let i = 0; i < extraMembers.length; i++) {
    const m = extraMembers[i]!;
    console.log(`Member ${i + 2}:    `, m.publicKey.toBase58());
  }
  console.log("Multisig PDA:  ", multisigPda.toBase58());
  console.log("Vault PDA:     ", vaultPda.toBase58());
  console.log("Cofre PDA:     ", cofrePda.toBase58());
  console.log("Operator:      ", operator.toBase58());

  // Fund all members so they can pay for their own approval transactions if needed
  console.log("\n[0] Funding members via airdrop if needed...");
  for (const member of allMembers) {
    await airdropIfNeeded(connection, member.publicKey, 0.5);
  }

  const balance = await connection.getBalance(creator.publicKey);
  console.log(`Creator balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  if (balance < 1 * LAMPORTS_PER_SOL) {
    throw new Error("Creator needs at least 1 SOL for multisig + vault funding");
  }

  const memberPermissions = Permissions.fromPermissions([
    Permission.Initiate,
    Permission.Vote,
    Permission.Execute,
  ]);

  const [programConfigPda] = multisig.getProgramConfigPda({});
  const programConfig = await ProgramConfig.fromAccountAddress(connection, programConfigPda);
  const treasury = programConfig.treasury;
  console.log("Treasury:      ", treasury.toBase58());

  console.log(`\n[1/${threshold + 4}] multisigCreateV2 (${threshold}-of-${numMembers})...`);
  const createSig = await multisig.rpc.multisigCreateV2({
    connection,
    treasury,
    createKey,
    creator,
    multisigPda,
    configAuthority: null,
    threshold,
    members: allMembers.map((k) => ({ key: k.publicKey, permissions: memberPermissions })),
    timeLock: 0,
    rentCollector: null,
    memo: `cloak-squads demo ${threshold}-of-${numMembers}`,
  });
  await confirm(connection, createSig);
  console.log("  tx:", createSig);

  console.log("\n[2] Fund vault (rent for Cofre init)...");
  const fundVaultSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: vaultPda,
        lamports: 20_000_000,
      }),
    ),
    [creator],
    { commitment: "confirmed" },
  );
  console.log("  tx:", fundVaultSig);

  const multisigAccount = await Multisig.fromAccountAddress(connection, multisigPda);
  const transactionIndex = BigInt(multisigAccount.transactionIndex.toString()) + 1n;

  const viewKeyPublic = new Uint8Array(32);
  viewKeyPublic.fill(0xcc);

  const innerIx = buildInitCofreIx({
    cofre: cofrePda,
    vaultPda,
    multisig: multisigPda,
    operator,
    viewKeyPublic,
  });
  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: [innerIx],
  });

  console.log("\n[3] vaultTransactionCreate (inner ix = init_cofre)...");
  const createTxSig = await multisig.rpc.vaultTransactionCreate({
    connection,
    feePayer: creator,
    multisigPda,
    transactionIndex,
    creator: creator.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    memo: `demo init_cofre via squads vault (${threshold}-of-${numMembers})`,
  });
  await confirm(connection, createTxSig);
  console.log("  tx:", createTxSig);

  console.log("\n[4] proposalCreate...");
  const proposalSig = await multisig.rpc.proposalCreate({
    connection,
    feePayer: creator,
    creator,
    multisigPda,
    transactionIndex,
  });
  await confirm(connection, proposalSig);
  console.log("  tx:", proposalSig);

  // Approve with enough members to reach threshold
  console.log(`\n[5] Approvals (${threshold} required)...`);
  const approvers = allMembers.slice(0, threshold);
  for (let i = 0; i < approvers.length; i++) {
    const member = approvers[i];
    if (!member) continue;
    const label = i === 0 ? "creator" : `member${i + 1}`;
    const approveSig = await multisig.rpc.proposalApprove({
      connection,
      feePayer: creator, // creator pays fees; member only needs to sign
      member,
      multisigPda,
      transactionIndex,
    });
    await confirm(connection, approveSig);
    console.log(`  approve(${label}):`, approveSig);
  }

  console.log("\n[6] vaultTransactionExecute...");
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

  console.log("\n=== Verifying Cofre on-chain ===");
  const cofreAccount = await connection.getAccountInfo(cofrePda);
  if (!cofreAccount) throw new Error(`FAIL: Cofre account ${cofrePda.toBase58()} not found`);
  if (!cofreAccount.owner.equals(GATEKEEPER_PROGRAM_ID)) {
    throw new Error(
      `FAIL: Cofre owner mismatch. Expected ${GATEKEEPER_PROGRAM_ID.toBase58()}, got ${cofreAccount.owner.toBase58()}`,
    );
  }

  const onChainOperator = new PublicKey(cofreAccount.data.subarray(40, 72));
  console.log(`On-chain operator: ${onChainOperator.toBase58()}`);
  if (!onChainOperator.equals(operator)) {
    throw new Error(`Operator mismatch! Expected ${operator.toBase58()}, got ${onChainOperator.toBase58()}`);
  }

  const summary = {
    multisig: multisigPda.toBase58(),
    vault: vaultPda.toBase58(),
    cofre: cofrePda.toBase58(),
    creator: creator.publicKey.toBase58(),
    operator: operator.toBase58(),
    createKey: Array.from(createKey.secretKey),
    threshold,
    numMembers,
    memberSecrets: extraMembers.map((k) => Array.from(k.secretKey)),
    setupTx: executeSig,
    explorer: `https://explorer.solana.com/tx/${executeSig}?cluster=devnet`,
    sendUrl: `http://localhost:3000/vault/${multisigPda.toBase58()}/send`,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(summary, null, 2));

  console.log(`\n✅ DEMO COFRE READY (${threshold}-of-${numMembers})`);
  console.log(
    JSON.stringify(
      { ...summary, createKey: "[redacted]", memberSecrets: "[redacted]" },
      null,
      2,
    ),
  );
  console.log(`\nFull config saved to: ${OUT_FILE}`);
  console.log(`\nNext: open ${summary.sendUrl} in your browser, or run:`);
  console.log(`  pnpm tsx scripts/test-f1-private-send-2ofn.ts <recipient> <amount-sol>`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
