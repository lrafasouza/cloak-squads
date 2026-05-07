import { getCurrentCluster } from "@/lib/cluster";
import { prisma } from "@/lib/prisma";
import { squadsVaultPda } from "@cloak-squads/core/pda";
import {
  Connection,
  type ParsedInstruction,
  type ParsedTransactionWithMeta,
  PublicKey,
} from "@solana/web3.js";

const RPC_URL = process.env.FALLBACK_RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? "";
const SQUADS_PROGRAM_ID = process.env.NEXT_PUBLIC_SQUADS_PROGRAM_ID ?? "";

/** Minimum window between RPC syncs for the same vault. Sync is otherwise
 *  triggered on every dashboard read which would burn RPC credits.
 *
 *  Set to 30s rather than the deposit-latency target (~5s). Real-time freshness
 *  comes from the WebSocket onAccountChange path that bypasses the throttle
 *  via `?force=true`; this throttle only governs polling reads. A bigger window
 *  also leaves margin under slow RPC: a fetch that takes 10s won't have
 *  another replica fan out in parallel before it completes. */
const SYNC_THROTTLE_MS = 30_000;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchParsedTxBatch(
  connection: Connection,
  signatures: string[],
  attempt = 0,
): Promise<(ParsedTransactionWithMeta | null)[]> {
  if (signatures.length === 0) return [];
  try {
    return await connection.getParsedTransactions(signatures, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
  } catch (err) {
    const is429 = err instanceof Error && err.message.includes("429");
    if (is429 && attempt < 3) {
      await delay(600 * 2 ** attempt);
      return fetchParsedTxBatch(connection, signatures, attempt + 1);
    }
    return signatures.map(() => null);
  }
}

type ParsedIncome = {
  signature: string;
  amountLamports: bigint;
  fromAddress: string;
  blockTime: Date;
  vaultIndex: number;
  toLabel: string | null;
};

export type ParseRejection = {
  signature: string;
  reason:
    | "tx_meta_missing"
    | "tx_failed"
    | "vault_not_in_accounts"
    | "balance_undefined"
    | "diff_too_small"
    | "diff_negative_or_zero";
  detail?: string;
};

function parseIncome(
  tx: ParsedTransactionWithMeta,
  sigInfo: { signature: string; blockTime: number | null | undefined },
  vaultAddress: string,
  vaultIndex: number,
  toLabel: string | null,
  rejections?: ParseRejection[],
): ParsedIncome | null {
  if (!tx.meta) {
    rejections?.push({ signature: sigInfo.signature, reason: "tx_meta_missing" });
    return null;
  }
  if (tx.meta.err) {
    rejections?.push({
      signature: sigInfo.signature,
      reason: "tx_failed",
      detail: JSON.stringify(tx.meta.err),
    });
    return null;
  }

  const accounts = tx.transaction.message.accountKeys;
  const vaultIdx = accounts.findIndex((a) => a.pubkey.toBase58() === vaultAddress);
  if (vaultIdx === -1) {
    rejections?.push({
      signature: sigInfo.signature,
      reason: "vault_not_in_accounts",
      detail: `vault=${vaultAddress.slice(0, 8)}... accounts=[${accounts
        .map((a) => a.pubkey.toBase58().slice(0, 8))
        .join(",")}]`,
    });
    return null;
  }

  const pre = tx.meta.preBalances[vaultIdx];
  const post = tx.meta.postBalances[vaultIdx];
  if (pre === undefined || post === undefined) {
    rejections?.push({ signature: sigInfo.signature, reason: "balance_undefined" });
    return null;
  }
  const diff = post - pre;
  if (diff <= 0) {
    rejections?.push({
      signature: sigInfo.signature,
      reason: "diff_negative_or_zero",
      detail: `diff=${diff}`,
    });
    return null;
  }
  if (diff < 100_000) {
    rejections?.push({
      signature: sigInfo.signature,
      reason: "diff_too_small",
      detail: `diff=${diff}`,
    });
    return null;
  }

  let from = "Unknown";
  let amountLamports = BigInt(diff);

  for (const ix of tx.transaction.message.instructions) {
    if (!("parsed" in ix)) continue;
    const pix = ix as ParsedInstruction;
    if (pix.program !== "system") continue;
    const parsed = pix.parsed as
      | { type?: string; info?: { destination?: string; source?: string; lamports?: number } }
      | undefined;
    if (parsed?.type === "transfer" && parsed.info?.destination === vaultAddress) {
      from = parsed.info.source ?? "Unknown";
      if (parsed.info.lamports !== undefined) amountLamports = BigInt(parsed.info.lamports);
      break;
    }
  }

  return {
    signature: sigInfo.signature,
    amountLamports,
    fromAddress: from,
    blockTime: new Date((sigInfo.blockTime ?? Math.floor(Date.now() / 1000)) * 1000),
    vaultIndex,
    toLabel,
  };
}

type SyncResult = { synced: number; throttled: boolean };

/**
 * Bring the VaultIncome table up to date with on-chain history for one
 * multisig. Throttled per vault to a minimum interval (default 8s) so
 * concurrent dashboard loads don't hammer the RPC; this throttle is enforced
 * via the VaultSyncState table so it survives across server replicas.
 *
 * Sync strategy:
 *   1. Pull last 50 signatures for each known vault PDA (primary + sub-vaults).
 *   2. Skip signatures we already have in DB.
 *   3. getParsedTransactions for the unseen ones in a single batch call.
 *   4. Upsert new income rows. Idempotent via @@unique([cofreAddress, signature]).
 *
 * The function never throws. On RPC failure it returns `{ synced: 0 }` and
 * the caller still gets whatever is already in DB.
 */
export async function syncVaultIncome(
  multisig: string,
  options: { force?: boolean } = {},
): Promise<SyncResult> {
  if (!RPC_URL || !SQUADS_PROGRAM_ID) return { synced: 0, throttled: false };

  let multisigPk: PublicKey;
  let squadsProgram: PublicKey;
  try {
    multisigPk = new PublicKey(multisig);
    squadsProgram = new PublicKey(SQUADS_PROGRAM_ID);
  } catch {
    return { synced: 0, throttled: false };
  }

  const cluster = getCurrentCluster();

  // Atomic throttle: a single SQL upsert that only writes when the previous
  // sync was older than the throttle window. Two concurrent requests can no
  // longer both pass a check-then-write race; exactly one wins and runs the
  // RPC fan-out. Force-sync skips the WHERE clause and always claims the slot.
  if (options.force) {
    await prisma.vaultSyncState.upsert({
      where: { cofreAddress: multisig },
      update: { lastIncomeSyncAt: new Date(), cluster },
      create: { cofreAddress: multisig, cluster, lastIncomeSyncAt: new Date() },
    });
  } else {
    const thresholdMs = Date.now() - SYNC_THROTTLE_MS;
    const updated = await prisma.$executeRaw`
      INSERT INTO "VaultSyncState" ("cofreAddress", "cluster", "lastIncomeSyncAt", "updatedAt")
      VALUES (${multisig}, ${cluster}, NOW(), NOW())
      ON CONFLICT ("cofreAddress")
      DO UPDATE SET "lastIncomeSyncAt" = NOW(), "updatedAt" = NOW(), "cluster" = ${cluster}
      WHERE "VaultSyncState"."lastIncomeSyncAt" IS NULL
         OR "VaultSyncState"."lastIncomeSyncAt" < to_timestamp(${thresholdMs}::double precision / 1000)
    `;
    // executeRaw returns the row count affected. 0 means another request
    // already claimed the slot inside the throttle window — skip this run.
    if (updated === 0) {
      return { synced: 0, throttled: true };
    }
  }

  const [primaryVaultPda] = squadsVaultPda(multisigPk, squadsProgram, 0);

  const subVaults = await prisma.subVault.findMany({
    where: { cofreAddress: multisig, cluster },
    select: { vaultIndex: true, name: true },
    orderBy: { vaultIndex: "asc" },
    take: 10,
  });

  type Target = { pda: PublicKey; address: string; vaultIndex: number; toLabel: string | null };
  const targets: Target[] = [
    { pda: primaryVaultPda, address: primaryVaultPda.toBase58(), vaultIndex: 0, toLabel: null },
    ...subVaults.map((sv) => {
      const [pda] = squadsVaultPda(multisigPk, squadsProgram, sv.vaultIndex);
      return {
        pda,
        address: pda.toBase58(),
        vaultIndex: sv.vaultIndex,
        toLabel: sv.name,
      };
    }),
  ];

  const connection = new Connection(RPC_URL, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
  });

  // Step 1: pull recent signatures per vault. 200 covers ~60+ days of typical
  // treasury volume; bumped from 50 so cold-start of an active vault doesn't
  // miss recent history when the dashboard renders the 30-day analytics.
  const sigsPerTarget = await Promise.all(
    targets.map((t) =>
      connection
        .getSignaturesForAddress(t.pda, { limit: 200 })
        .catch(() => [] as Awaited<ReturnType<typeof connection.getSignaturesForAddress>>),
    ),
  );

  type TaggedSig = {
    signature: string;
    blockTime: number;
    vaultAddress: string;
    vaultIndex: number;
    toLabel: string | null;
  };
  const tagged: TaggedSig[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const sigs = sigsPerTarget[i] ?? [];
    if (!target) continue;
    for (const s of sigs) {
      const key = `${s.signature}|${target.address}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tagged.push({
        signature: s.signature,
        blockTime: s.blockTime ?? 0,
        vaultAddress: target.address,
        vaultIndex: target.vaultIndex,
        toLabel: target.toLabel,
      });
    }
  }

  if (tagged.length === 0) return { synced: 0, throttled: false };

  // Step 2: drop signatures we already have for this (multisig, vaultIndex).
  // Keying by signature alone would skip sub-vault deposits whose primary
  // sibling was already indexed (a single tx can deposit to both).
  const existing = await prisma.vaultIncome.findMany({
    where: {
      cofreAddress: multisig,
      signature: { in: tagged.map((t) => t.signature) },
    },
    select: { signature: true, vaultIndex: true },
  });
  const existingSet = new Set(existing.map((e) => `${e.signature}|${e.vaultIndex}`));
  const unseen = tagged.filter((t) => !existingSet.has(`${t.signature}|${t.vaultIndex}`));

  if (unseen.length === 0) return { synced: 0, throttled: false };

  // Step 3: parse only the unseen signatures
  const uniqueSigs = [...new Set(unseen.map((t) => t.signature))];
  const txMap = new Map<string, ParsedTransactionWithMeta | null>();
  const txResults = await fetchParsedTxBatch(connection, uniqueSigs);
  uniqueSigs.forEach((sig, i) => txMap.set(sig, txResults[i] ?? null));

  const incomes: ParsedIncome[] = [];
  for (const t of unseen) {
    const tx = txMap.get(t.signature);
    if (!tx) continue;
    const parsed = parseIncome(
      tx,
      { signature: t.signature, blockTime: t.blockTime },
      t.vaultAddress,
      t.vaultIndex,
      t.toLabel,
    );
    if (parsed) incomes.push(parsed);
  }

  if (incomes.length === 0) return { synced: 0, throttled: false };

  // Step 4: upsert. Race-safe via @@unique([cofreAddress, signature, vaultIndex]).
  // The vaultIndex is part of the key because a single signature can deposit
  // into multiple vault PDAs of the same multisig and we want each preserved.
  await prisma.$transaction(
    incomes.map((inc) =>
      prisma.vaultIncome.upsert({
        where: {
          cofreAddress_signature_vaultIndex: {
            cofreAddress: multisig,
            signature: inc.signature,
            vaultIndex: inc.vaultIndex,
          },
        },
        update: {
          // Don't overwrite immutable on-chain fields; only update toLabel in
          // case sub-vault rename happened.
          toLabel: inc.toLabel,
        },
        create: {
          cofreAddress: multisig,
          cluster,
          vaultIndex: inc.vaultIndex,
          signature: inc.signature,
          amountLamports: inc.amountLamports.toString(),
          fromAddress: inc.fromAddress,
          blockTime: inc.blockTime,
          toLabel: inc.toLabel,
        },
      }),
    ),
  );

  return { synced: incomes.length, throttled: false };
}

// ── Read-only diagnostic helper ────────────────────────────────────────────
//
// Mirrors the sync flow but skips DB writes and returns a structured trace
// of what would have happened. Surfaced via the income endpoint's
// `?debug=true` query so a deposit that doesn't appear in the UI can be
// pinpointed (vault PDA, sigs found, parse rejections per signature)
// without server-log access.

export type SyncInspection = {
  rpcUrl: string;
  cluster: string;
  targets: Array<{ vaultIndex: number; address: string; sigsFetched: number }>;
  totalSigsFetched: number;
  alreadyInDb: number;
  unseen: number;
  txsResolved: number;
  parsedAsIncome: number;
  rejections: ParseRejection[];
  newestSigSampled?: { signature: string; blockTime: number; vaultAddress: string };
};

export async function inspectVaultIncomeSync(multisig: string): Promise<SyncInspection> {
  const empty: SyncInspection = {
    rpcUrl: RPC_URL ? "configured" : "missing",
    cluster: getCurrentCluster(),
    targets: [],
    totalSigsFetched: 0,
    alreadyInDb: 0,
    unseen: 0,
    txsResolved: 0,
    parsedAsIncome: 0,
    rejections: [],
  };
  if (!RPC_URL || !SQUADS_PROGRAM_ID) return empty;

  let multisigPk: PublicKey;
  let squadsProgram: PublicKey;
  try {
    multisigPk = new PublicKey(multisig);
    squadsProgram = new PublicKey(SQUADS_PROGRAM_ID);
  } catch {
    return empty;
  }

  const cluster = getCurrentCluster();
  const [primaryVaultPda] = squadsVaultPda(multisigPk, squadsProgram, 0);

  const subVaults = await prisma.subVault.findMany({
    where: { cofreAddress: multisig, cluster },
    select: { vaultIndex: true, name: true },
    orderBy: { vaultIndex: "asc" },
    take: 10,
  });

  type Target = { pda: PublicKey; address: string; vaultIndex: number; toLabel: string | null };
  const targets: Target[] = [
    { pda: primaryVaultPda, address: primaryVaultPda.toBase58(), vaultIndex: 0, toLabel: null },
    ...subVaults.map((sv) => {
      const [pda] = squadsVaultPda(multisigPk, squadsProgram, sv.vaultIndex);
      return { pda, address: pda.toBase58(), vaultIndex: sv.vaultIndex, toLabel: sv.name };
    }),
  ];

  const connection = new Connection(RPC_URL, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
  });

  const sigsPerTarget = await Promise.all(
    targets.map((t) =>
      connection
        .getSignaturesForAddress(t.pda, { limit: 50 })
        .catch(() => [] as Awaited<ReturnType<typeof connection.getSignaturesForAddress>>),
    ),
  );

  const targetSummary: SyncInspection["targets"] = targets.map((t, i) => ({
    vaultIndex: t.vaultIndex,
    address: t.address,
    sigsFetched: sigsPerTarget[i]?.length ?? 0,
  }));

  type TaggedSig = {
    signature: string;
    blockTime: number;
    vaultAddress: string;
    vaultIndex: number;
    toLabel: string | null;
  };
  const tagged: TaggedSig[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const sigs = sigsPerTarget[i] ?? [];
    if (!target) continue;
    for (const s of sigs) {
      const key = `${s.signature}|${target.address}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tagged.push({
        signature: s.signature,
        blockTime: s.blockTime ?? 0,
        vaultAddress: target.address,
        vaultIndex: target.vaultIndex,
        toLabel: target.toLabel,
      });
    }
  }

  const totalSigsFetched = tagged.length;
  if (totalSigsFetched === 0) return { ...empty, targets: targetSummary };

  const existing = await prisma.vaultIncome.findMany({
    where: {
      cofreAddress: multisig,
      signature: { in: tagged.map((t) => t.signature) },
    },
    select: { signature: true, vaultIndex: true },
  });
  const existingSet = new Set(existing.map((e) => `${e.signature}|${e.vaultIndex}`));
  const unseenList = tagged.filter((t) => !existingSet.has(`${t.signature}|${t.vaultIndex}`));

  // Newest unseen sig — useful to confirm the recent deposit is in the fetch.
  const newest = [...tagged].sort((a, b) => b.blockTime - a.blockTime)[0];

  // Parse the unseen ones and collect rejections.
  const uniqueSigs = [...new Set(unseenList.map((t) => t.signature))];
  const txResults = await fetchParsedTxBatch(connection, uniqueSigs);
  const txMap = new Map<string, ParsedTransactionWithMeta | null>();
  uniqueSigs.forEach((sig, i) => txMap.set(sig, txResults[i] ?? null));

  let txsResolved = 0;
  let parsedAsIncome = 0;
  const rejections: ParseRejection[] = [];
  for (const t of unseenList) {
    const tx = txMap.get(t.signature);
    if (!tx) {
      rejections.push({ signature: t.signature, reason: "tx_meta_missing" });
      continue;
    }
    txsResolved += 1;
    const parsed = parseIncome(
      tx,
      { signature: t.signature, blockTime: t.blockTime },
      t.vaultAddress,
      t.vaultIndex,
      t.toLabel,
      rejections,
    );
    if (parsed) parsedAsIncome += 1;
  }

  const result: SyncInspection = {
    rpcUrl: "configured",
    cluster,
    targets: targetSummary,
    totalSigsFetched,
    alreadyInDb: existing.length,
    unseen: unseenList.length,
    txsResolved,
    parsedAsIncome,
    rejections: rejections.slice(0, 30),
  };
  if (newest) {
    result.newestSigSampled = {
      signature: newest.signature,
      blockTime: newest.blockTime,
      vaultAddress: newest.vaultAddress,
    };
  }
  return result;
}

export type StoredIncome = {
  kind: "income";
  signature: string;
  /** Stringified lamports — preserves precision for treasuries above
   *  ~9M SOL per single tx (Number.MAX_SAFE_INTEGER boundary). */
  amountLamports: string;
  from: string;
  blockTime: number;
  toLabel?: string | undefined;
};

/**
 * Read income rows out of the DB for a given vault, newest first.
 * Returns the same shape the existing useVaultIncome client hook expects.
 *
 * Filters by current cluster so devnet/mainnet history doesn't bleed across
 * envs that share a database. Rows whose `cluster` is null (legacy or fresh
 * inserts pre-multi-env) are still returned, matching the conventions in
 * Vault/SubVault/RecurringPayment models.
 */
export async function readVaultIncome(multisig: string, limit: number): Promise<StoredIncome[]> {
  const cluster = getCurrentCluster();
  const rows = await prisma.vaultIncome.findMany({
    where: {
      cofreAddress: multisig,
      OR: [{ cluster }, { cluster: null }],
    },
    orderBy: { blockTime: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    kind: "income" as const,
    signature: r.signature,
    amountLamports: r.amountLamports, // already stringified BigInt in DB
    from: r.fromAddress,
    blockTime: Math.floor(r.blockTime.getTime() / 1000),
    toLabel: r.toLabel ?? undefined,
  }));
}
