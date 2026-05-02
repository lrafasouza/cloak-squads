import { Connection, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

// Squads Multisig V4 binary layout (Anchor 8-byte discriminator):
//  [8]  discriminator
//  [32] create_key
//  [32] config_authority
//  [2]  threshold (u16)
//  [4]  time_lock (u32)
//  [8]  transaction_index (u64)
//  [8]  stale_transaction_index (u64)
//  [1|33] rent_collector (Option<Pubkey>)
//  [1]  bump
//  [4]  members.len
//  [36*i] members[i] = key(32) + permissions(4)
//
// Member key offsets:
//   rent_collector = None → base = 100 → member[i].key = 100 + i*36
//   rent_collector = Some → base = 132 → member[i].key = 132 + i*36

const MAX_MEMBER_SLOTS = 6; // covers 99%+ of real-world vaults
const BATCH_SIZE = 3; // max concurrent requests to stay under public RPC rate limits
const BATCH_DELAY_MS = 300;

// Always query mainnet where real Squads vaults live,
// regardless of which cluster the app is pointed at.
const MAINNET_RPC =
  process.env.MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const SQUADS_PROGRAM_MAINNET = "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function runBatched<T>(
  tasks: (() => Promise<T>)[],
  batchSize: number,
  delayMs: number,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    if (i > 0) await sleep(delayMs);
    const batch = tasks.slice(i, i + batchSize).map((fn) => fn());
    results.push(...(await Promise.all(batch)));
  }
  return results;
}

export async function GET(request: Request) {
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

  let programId: PublicKey;
  try {
    programId = new PublicKey(SQUADS_PROGRAM_MAINNET);
  } catch {
    return NextResponse.json({ error: "Invalid Squads program ID" }, { status: 500 });
  }

  const connection = new Connection(MAINNET_RPC, "confirmed");
  const ownerBase58 = ownerPk.toBase58();

  // Build all offset variants: MAX_MEMBER_SLOTS positions × 2 rent_collector states
  const offsets: number[] = [];
  for (let i = 0; i < MAX_MEMBER_SLOTS; i++) {
    offsets.push(100 + i * 36); // rent_collector = None
    offsets.push(132 + i * 36); // rent_collector = Some
  }

  const tasks = offsets.map(
    (offset) => () =>
      connection.getProgramAccounts(programId, {
        dataSlice: { offset: 0, length: 0 },
        filters: [{ memcmp: { offset, bytes: ownerBase58 } }],
        encoding: "base64",
      }),
  );

  let results: Awaited<ReturnType<typeof connection.getProgramAccounts>>[];
  try {
    results = await runBatched(tasks, BATCH_SIZE, BATCH_DELAY_MS);
  } catch (err) {
    console.error("[api/vaults/mine] getProgramAccounts failed:", err);
    return NextResponse.json({ error: "Failed to query on-chain vaults" }, { status: 500 });
  }

  const seen = new Set<string>();
  const vaults: string[] = [];
  for (const accounts of results) {
    for (const { pubkey } of accounts) {
      const addr = pubkey.toBase58();
      if (!seen.has(addr)) {
        seen.add(addr);
        vaults.push(addr);
      }
    }
  }

  return NextResponse.json({ vaults });
}
