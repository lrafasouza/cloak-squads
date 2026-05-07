import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { squadsVaultPda } from "@cloak-squads/core/pda";
import { Connection, PublicKey } from "@solana/web3.js";
import type { ParsedInstruction, ParsedTransactionWithMeta } from "@solana/web3.js";
import { NextResponse } from "next/server";

export type IncomeEntry = {
  kind: "income";
  signature: string;
  amountLamports: number;
  from: string;
  blockTime: number;
  toLabel?: string | undefined; // undefined = primary vault
};

const RPC_URL = process.env.FALLBACK_RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? "";
const SQUADS_PROGRAM_ID = process.env.NEXT_PUBLIC_SQUADS_PROGRAM_ID ?? "";

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
      await delay(600 * Math.pow(2, attempt));
      return fetchParsedTxBatch(connection, signatures, attempt + 1);
    }
    return signatures.map(() => null);
  }
}

type VaultTarget = { pda: PublicKey; address: string; toLabel: string | undefined };

function parseIncome(
  tx: ParsedTransactionWithMeta,
  sigInfo: { signature: string; blockTime: number | null | undefined },
  vaultAddress: string,
  toLabel: string | undefined,
): IncomeEntry | null {
  if (!tx.meta || tx.meta.err) return null;

  const accounts = tx.transaction.message.accountKeys;
  const vaultIdx = accounts.findIndex((a) => a.pubkey.toBase58() === vaultAddress);
  if (vaultIdx === -1) return null;

  const pre = tx.meta.preBalances[vaultIdx];
  const post = tx.meta.postBalances[vaultIdx];
  if (pre === undefined || post === undefined) return null;
  const diff = post - pre;
  if (diff < 100_000) return null;

  let from = "Unknown";
  let amountLamports = diff;

  for (const ix of tx.transaction.message.instructions) {
    if (!("parsed" in ix)) continue;
    const pix = ix as ParsedInstruction;
    if (pix.program !== "system") continue;
    const parsed = pix.parsed as {
      type?: string;
      info?: { destination?: string; source?: string; lamports?: number };
    } | undefined;
    if (parsed?.type === "transfer" && parsed.info?.destination === vaultAddress) {
      from = parsed.info.source ?? "Unknown";
      amountLamports = parsed.info.lamports ?? diff;
      break;
    }
  }

  return {
    kind: "income",
    signature: sigInfo.signature,
    amountLamports,
    from,
    blockTime: sigInfo.blockTime ?? Math.floor(Date.now() / 1000),
    toLabel,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ multisig: string }> },
) {
  const { multisig } = await context.params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10", 10), 50);

  let multisigPk: PublicKey;
  try {
    multisigPk = new PublicKey(multisig);
  } catch {
    return NextResponse.json({ error: "Invalid multisig address." }, { status: 400 });
  }

  if (!RPC_URL) {
    return NextResponse.json({ error: "RPC URL not configured." }, { status: 500 });
  }

  let squadsProgram: PublicKey;
  try {
    squadsProgram = new PublicKey(SQUADS_PROGRAM_ID);
  } catch {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  const [primaryVaultPda] = squadsVaultPda(multisigPk, squadsProgram, 0);

  // Fetch registered sub-vaults from DB
  let subVaultEntries: Array<{ vaultIndex: number; name: string }> = [];
  try {
    if (isPrismaAvailable()) {
      subVaultEntries = await prisma.subVault.findMany({
        where: { cofreAddress: multisig },
        select: { vaultIndex: true, name: true },
        orderBy: { vaultIndex: "asc" },
        take: 10, // cap to avoid too many RPC calls
      });
    }
  } catch {}

  const targets: VaultTarget[] = [
    { pda: primaryVaultPda, address: primaryVaultPda.toBase58(), toLabel: undefined },
    ...subVaultEntries.map((sv) => {
      const [pda] = squadsVaultPda(multisigPk, squadsProgram, sv.vaultIndex);
      return { pda, address: pda.toBase58(), toLabel: sv.name };
    }),
  ];

  const connection = new Connection(RPC_URL, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
  });

  try {
    // Fetch signatures for all vaults concurrently
    const sigsPerTarget = await Promise.all(
      targets.map((t) =>
        connection
          .getSignaturesForAddress(t.pda, { limit: 25 })
          .catch(() => [] as Awaited<ReturnType<typeof connection.getSignaturesForAddress>>),
      ),
    );

    // Build a flat list of { sig, blockTime, vaultAddress, toLabel } deduped by sig+vaultAddress
    type TaggedSig = {
      signature: string;
      blockTime: number;
      vaultAddress: string;
      toLabel: string | undefined;
    };
    const seen = new Set<string>();
    const taggedSigs: TaggedSig[] = [];

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]!;
      const sigs = sigsPerTarget[i] ?? [];
      for (const s of sigs) {
        const key = `${s.signature}|${target.address}`;
        if (seen.has(key)) continue;
        seen.add(key);
        taggedSigs.push({
          signature: s.signature,
          blockTime: s.blockTime ?? 0,
          vaultAddress: target.address,
          toLabel: target.toLabel,
        });
      }
    }

    // Sort by recency, take a batch to parse
    taggedSigs.sort((a, b) => b.blockTime - a.blockTime);
    const batchToFetch = taggedSigs.slice(0, 60);

    if (batchToFetch.length === 0) {
      return NextResponse.json(
        { entries: [] },
        { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
      );
    }

    // Batch-fetch unique signatures
    const uniqueSigs = [...new Set(batchToFetch.map((t) => t.signature))];
    const txMap = new Map<string, ParsedTransactionWithMeta | null>();
    const txResults = await fetchParsedTxBatch(connection, uniqueSigs);
    uniqueSigs.forEach((sig, i) => txMap.set(sig, txResults[i] ?? null));

    // Parse each tagged sig
    const entries: IncomeEntry[] = [];
    for (const tagged of batchToFetch) {
      if (entries.length >= limit) break;
      const tx = txMap.get(tagged.signature);
      if (!tx) continue;
      const entry = parseIncome(
        tx,
        { signature: tagged.signature, blockTime: tagged.blockTime },
        tagged.vaultAddress,
        tagged.toLabel,
      );
      if (entry) entries.push(entry);
    }

    return NextResponse.json(
      { entries },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch (err) {
    console.error("[income] RPC error:", err);
    return NextResponse.json({ error: "RPC error." }, { status: 500 });
  }
}
