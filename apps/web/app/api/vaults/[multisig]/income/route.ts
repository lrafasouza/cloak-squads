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
};

const RPC_URL =
  process.env.FALLBACK_RPC_URL ??
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://api.devnet.solana.com";
const SQUADS_PROGRAM_ID = process.env.NEXT_PUBLIC_SQUADS_PROGRAM_ID ?? "";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchParsedTxBatch(
  connection: Connection,
  signatures: string[],
  attempt = 0,
): Promise<(ParsedTransactionWithMeta | null)[]> {
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

  let squadsProgram: PublicKey;
  try {
    squadsProgram = new PublicKey(SQUADS_PROGRAM_ID);
  } catch {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  const [vaultPda] = squadsVaultPda(multisigPk, squadsProgram);
  const vaultAddress = vaultPda.toBase58();

  const connection = new Connection(RPC_URL, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
  });

  try {
    const sigs = await connection.getSignaturesForAddress(vaultPda, { limit: 50 });

    if (sigs.length === 0) {
      return NextResponse.json(
        { entries: [] },
        { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
      );
    }

    const txs = await fetchParsedTxBatch(connection, sigs.map((s) => s.signature));

    const entries: IncomeEntry[] = [];

    for (let i = 0; i < txs.length && entries.length < limit; i++) {
      const tx = txs[i];
      const sig = sigs[i];
      if (!tx || !tx.meta || tx.meta.err || !sig) continue;

      const accounts = tx.transaction.message.accountKeys;
      const vaultIdx = accounts.findIndex((a) => a.pubkey.toBase58() === vaultAddress);
      if (vaultIdx === -1) continue;

      const pre = tx.meta.preBalances[vaultIdx];
      const post = tx.meta.postBalances[vaultIdx];
      if (pre === undefined || post === undefined) continue;
      const diff = post - pre;

      if (diff < 100_000) continue;

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

      entries.push({
        kind: "income",
        signature: sig.signature,
        amountLamports,
        from,
        blockTime: sig.blockTime ?? Math.floor(Date.now() / 1000),
      });
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
