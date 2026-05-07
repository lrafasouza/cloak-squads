/**
 * Backfill VaultIncome.fromAddress for rows where the original parser left it
 * as "Unknown" — typically intra-treasury Squads transfers whose System.transfer
 * lives in inner instructions, which the legacy parser didn't walk.
 *
 * After deploying the parser fix in apps/web/lib/vault-income-sync.ts, NEW rows
 * are tagged correctly. This script walks OLD rows so historical KPIs (the 30d
 * inflow window in particular) become accurate retroactively. It is idempotent
 * and safe to re-run: rows that resolve back to "Unknown" stay as-is.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-vault-income-from.ts                # all clusters
 *   pnpm tsx scripts/backfill-vault-income-from.ts --cluster=devnet
 *   pnpm tsx scripts/backfill-vault-income-from.ts --multisig=ADDR
 *   pnpm tsx scripts/backfill-vault-income-from.ts --dry-run
 *
 * Env required:
 *   DATABASE_URL, FALLBACK_RPC_URL or NEXT_PUBLIC_RPC_URL
 */

import { PrismaClient } from "@prisma/client";
import {
  Connection,
  type ParsedInstruction,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";

const RPC_URL = process.env.FALLBACK_RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? "";

type Args = {
  cluster?: string;
  multisig?: string;
  dryRun: boolean;
};

function parseArgs(): Args {
  const args: Args = { dryRun: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--cluster=")) args.cluster = arg.slice("--cluster=".length);
    else if (arg.startsWith("--multisig=")) args.multisig = arg.slice("--multisig=".length);
  }
  return args;
}

/**
 * Mirrors the production parser in apps/web/lib/vault-income-sync.ts. Inlined
 * here (instead of imported) so the script doesn't pull the Next.js runtime
 * graph just to share ~30 lines of pure parsing.
 */
function recoverSource(
  tx: ParsedTransactionWithMeta,
  vaultAddress: string,
): { from: string; lamports: bigint | null } {
  let from = "Unknown";
  let parsedLamports: bigint | null = null;

  const visit = (ix: unknown): boolean => {
    if (!ix || typeof ix !== "object" || !("parsed" in ix)) return false;
    const pix = ix as ParsedInstruction;
    if (pix.program !== "system") return false;
    const parsed = pix.parsed as
      | { type?: string; info?: { destination?: string; source?: string; lamports?: number } }
      | undefined;
    if (parsed?.type !== "transfer") return false;
    if (parsed.info?.destination !== vaultAddress) return false;
    from = parsed.info.source ?? "Unknown";
    if (parsed.info.lamports !== undefined) parsedLamports = BigInt(parsed.info.lamports);
    return true;
  };

  for (const ix of tx.transaction.message.instructions) {
    if (visit(ix)) return { from, lamports: parsedLamports };
  }
  for (const inner of tx.meta?.innerInstructions ?? []) {
    for (const ix of inner.instructions) {
      if (visit(ix)) return { from, lamports: parsedLamports };
    }
  }
  return { from, lamports: parsedLamports };
}

async function main() {
  if (!RPC_URL) {
    console.error("Missing FALLBACK_RPC_URL / NEXT_PUBLIC_RPC_URL.");
    process.exit(1);
  }

  const args = parseArgs();
  const prisma = new PrismaClient();
  const connection = new Connection(RPC_URL, { commitment: "confirmed" });

  const where: Record<string, unknown> = { fromAddress: "Unknown" };
  if (args.cluster) where.cluster = args.cluster;
  if (args.multisig) where.cofreAddress = args.multisig;

  const rows = await prisma.vaultIncome.findMany({
    where,
    select: {
      id: true,
      cofreAddress: true,
      cluster: true,
      vaultIndex: true,
      signature: true,
      amountLamports: true,
      fromAddress: true,
    },
    orderBy: { blockTime: "asc" },
  });

  console.log(
    `Found ${rows.length} candidate rows (fromAddress="Unknown")` +
      (args.cluster ? ` on ${args.cluster}` : "") +
      (args.multisig ? ` for ${args.multisig}` : "") +
      (args.dryRun ? " — dry run, no writes" : ""),
  );

  // We need the vault PDA per row to know which destination key to look for.
  // The schema doesn't store the PDA directly, but vaultIndex + cofreAddress
  // (the multisig PDA) lets us derive it. We import the same helper the app
  // uses to keep derivation byte-identical.
  const { squadsVaultPda } = await import("@cloak-squads/core/pda");
  const { PublicKey } = await import("@solana/web3.js");
  const SQUADS_PROGRAM_ID = process.env.NEXT_PUBLIC_SQUADS_PROGRAM_ID;
  if (!SQUADS_PROGRAM_ID) {
    console.error("Missing NEXT_PUBLIC_SQUADS_PROGRAM_ID env.");
    process.exit(1);
  }
  const squadsProgram = new PublicKey(SQUADS_PROGRAM_ID);

  let updated = 0;
  let stillUnknown = 0;
  let rpcMisses = 0;
  let amountChanged = 0;

  for (const row of rows) {
    let multisigPk: InstanceType<typeof PublicKey>;
    try {
      multisigPk = new PublicKey(row.cofreAddress);
    } catch {
      console.warn(`  skip: invalid multisig ${row.cofreAddress} on row ${row.id}`);
      continue;
    }
    const [vaultPda] = squadsVaultPda(multisigPk, squadsProgram, row.vaultIndex);
    const vaultAddress = vaultPda.toBase58();

    let tx: ParsedTransactionWithMeta | null = null;
    try {
      tx = await connection.getParsedTransaction(row.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
    } catch (err) {
      console.warn(`  rpc error for ${row.signature.slice(0, 12)}…: ${(err as Error).message}`);
    }

    if (!tx) {
      rpcMisses += 1;
      continue;
    }

    const { from, lamports } = recoverSource(tx, vaultAddress);
    if (from === "Unknown") {
      stillUnknown += 1;
      continue;
    }

    const newAmount = lamports !== null ? lamports.toString() : row.amountLamports;
    const amountWillChange = newAmount !== row.amountLamports;
    if (amountWillChange) amountChanged += 1;

    if (args.dryRun) {
      console.log(
        `  [dry] ${row.signature.slice(0, 12)}… vault[${row.vaultIndex}] from="Unknown" → "${from.slice(0, 12)}…"` +
          (amountWillChange ? ` amount ${row.amountLamports} → ${newAmount}` : ""),
      );
    } else {
      await prisma.vaultIncome.update({
        where: { id: row.id },
        data: {
          fromAddress: from,
          ...(amountWillChange ? { amountLamports: newAmount } : {}),
        },
      });
    }
    updated += 1;
  }

  console.log("");
  console.log(`Resolved sources for: ${updated}`);
  console.log(`  of which amount also corrected: ${amountChanged}`);
  console.log(`Still "Unknown" after re-parse: ${stillUnknown}`);
  console.log(`RPC misses (tx not returned):   ${rpcMisses}`);
  if (args.dryRun) console.log("\nDry-run mode — no rows were modified.");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
