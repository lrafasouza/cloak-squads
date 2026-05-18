import { enforceIpAndWalletLimits } from "@/lib/rate-limit";
import { requireWalletAuth } from "@/lib/wallet-auth";
import { Connection, PublicKey } from "@solana/web3.js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const MAX_MEMBER_SLOTS = 4;
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 2000;
const CACHE_TTL_MS = 30_000;

// Use the same cluster the rest of the app talks to. The previous code
// preferred MAINNET_RPC_URL even on devnet, which silently returned mainnet
// vault listings to devnet users.
const RPC_URL =
  process.env.FALLBACK_RPC_URL ??
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://api.mainnet-beta.solana.com";
const SQUADS_PROGRAM_ID =
  process.env.NEXT_PUBLIC_SQUADS_PROGRAM_ID ?? "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";

type CacheEntry = { vaults: string[]; ts: number };
const memberVaultsCache = new Map<string, CacheEntry>();

async function fetchOffset(
  connection: Connection,
  programId: PublicKey,
  offset: number,
  ownerBase58: string,
): Promise<string[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      const accounts = await connection.getProgramAccounts(programId, {
        dataSlice: { offset: 0, length: 0 },
        filters: [{ memcmp: { offset, bytes: ownerBase58 } }],
        encoding: "base64",
      });
      return accounts.map((a) => a.pubkey.toBase58());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        msg.includes("429") || msg.includes("Too Many Requests") || msg.includes("rate");
      if (attempt < MAX_RETRIES && isRetryable) {
        console.warn(`[api/vaults/mine] offset ${offset} 429, retrying…`);
        await new Promise<void>((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      console.error(`[api/vaults/mine] offset ${offset} skipped:`, msg.slice(0, 120));
      return [];
    }
  }
}

export async function GET(request: Request) {
  // Authenticated route: each scan fans out 8 getProgramAccounts calls to the
  // RPC, so leaving it open invites quota drain. Caller must also be the
  // owner — this endpoint is "show me my vaults", not "show me anyone's".
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");

  if (!owner) {
    return NextResponse.json({ error: "Missing owner parameter" }, { status: 400 });
  }

  let ownerPk: PublicKey;
  try {
    ownerPk = new PublicKey(owner);
  } catch {
    return NextResponse.json({ error: "Invalid owner address" }, { status: 400 });
  }

  if (ownerPk.toBase58() !== auth.publicKey) {
    // Don't let an authenticated user enumerate vaults for arbitrary other
    // wallets. The on-chain data is technically public (anyone with an RPC
    // can run getProgramAccounts), but we don't accelerate targeted recon.
    return NextResponse.json({ error: "owner must match authenticated wallet" }, { status: 403 });
  }

  const hdrs = await headers();
  const rawIp = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  const ip = (rawIp.split(",")[0] ?? rawIp).trim();
  if (
    !(await enforceIpAndWalletLimits({
      ip,
      pubkey: auth.publicKey,
      scope: "vaults-mine",
      ipLimit: 6,
      walletLimit: 12,
    }))
  ) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const ownerBase58 = ownerPk.toBase58();

  // Per-process memo to avoid re-running 8 RPC calls when the user (or a
  // background refresh) hits this endpoint multiple times in a short window.
  // 30s TTL aligns with how often the my-vaults UI re-checks.
  const cached = memberVaultsCache.get(ownerBase58);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json({ vaults: cached.vaults });
  }

  let programId: PublicKey;
  try {
    programId = new PublicKey(SQUADS_PROGRAM_ID);
  } catch {
    return NextResponse.json({ error: "Invalid Squads program ID" }, { status: 500 });
  }

  const connection = new Connection(RPC_URL, "confirmed");

  const offsets: number[] = [];
  for (let i = 0; i < MAX_MEMBER_SLOTS; i++) {
    offsets.push(100 + i * 36);
    offsets.push(132 + i * 36);
  }

  const seen = new Set<string>();
  const vaults: string[] = [];

  const promises = offsets.map((offset) => fetchOffset(connection, programId, offset, ownerBase58));

  const results = await Promise.all(promises);

  for (const addrs of results) {
    for (const addr of addrs) {
      if (!seen.has(addr)) {
        seen.add(addr);
        vaults.push(addr);
      }
    }
  }

  memberVaultsCache.set(ownerBase58, { vaults, ts: Date.now() });

  return NextResponse.json({ vaults });
}
