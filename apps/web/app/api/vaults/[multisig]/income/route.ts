import { checkRateLimitAsync, rateLimitBucket } from "@/lib/rate-limit";
import { readVaultIncome, syncVaultIncome } from "@/lib/vault-income-sync";
import { PublicKey } from "@solana/web3.js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Vault income endpoint, DB-backed.
 *
 * Flow per request:
 *   1. Trigger a throttled sync from RPC (skipped if a sync ran in the last
 *      ~8s; the throttle lives in `VaultSyncState` so it survives across
 *      replicas).
 *   2. Read rows from `VaultIncome`, newest first, capped by ?limit=.
 *
 * The DB is the source of truth; the sync is best-effort enrichment. If RPC
 * is unavailable or rate-limited, the user still sees previously indexed
 * income.
 *
 * `force=true` bypasses the server-side sync throttle. Because that costs
 * RPC credits regardless of who is asking, we rate-limit it per IP. The
 * default (non-force) path is unauthenticated by design — incoming
 * transfers are public on-chain and the response is sliced from a public
 * index.
 */

export type IncomeEntry = {
  kind: "income";
  signature: string;
  /** Stringified base-units to preserve precision past Number.MAX_SAFE_INTEGER. */
  amountLamports: string;
  from: string;
  blockTime: number;
  toLabel?: string | undefined;
};

// NOTE: amountLamports moved from `number` to `string` in this rev. Consumers
// using the value for display can call BigInt() before formatting; consumers
// summing it should use BigInt addition. See useTreasuryFlow.

function parseLimit(raw: string | null): number {
  // Defends against ?limit=foo (NaN), negative values, and overflow. The
  // hot path is the cached "10" default, so the small validation is free.
  const parsed = Number.parseInt(raw ?? "10", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 10;
  return Math.min(parsed, 200);
}

export async function GET(request: Request, context: { params: Promise<{ multisig: string }> }) {
  const { multisig } = await context.params;
  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const force = searchParams.get("force") === "true";

  try {
    new PublicKey(multisig);
  } catch {
    return NextResponse.json({ error: "Invalid multisig address." }, { status: 400 });
  }

  if (force) {
    const hdrs = await headers();
    const raw = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
    const ip = (raw.split(",")[0] ?? raw).trim();
    const ok = await checkRateLimitAsync(rateLimitBucket(ip, "income-force"), "write");
    if (!ok) {
      return NextResponse.json({ error: "Too many force-sync requests" }, { status: 429 });
    }
  }

  // Trigger sync but don't block the read on it failing. The sync helper
  // never throws; it returns a result object.
  await syncVaultIncome(multisig, { force }).catch((err) => {
    console.error("[income] sync failed (returning DB-only data):", err);
  });

  const entries = await readVaultIncome(multisig, limit);

  return NextResponse.json(
    { entries },
    {
      headers: { "Cache-Control": "private, max-age=5" },
    },
  );
}
