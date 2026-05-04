import { Connection, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

const MAX_MEMBER_SLOTS = 4;
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 2000;

const RPC_URL =
  process.env.MAINNET_RPC_URL ??
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://api.mainnet-beta.solana.com";
const SQUADS_PROGRAM_ID =
  process.env.NEXT_PUBLIC_SQUADS_PROGRAM_ID ?? "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";

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
    programId = new PublicKey(SQUADS_PROGRAM_ID);
  } catch {
    return NextResponse.json({ error: "Invalid Squads program ID" }, { status: 500 });
  }

  const connection = new Connection(RPC_URL, "confirmed");
  const ownerBase58 = ownerPk.toBase58();

  const offsets: number[] = [];
  for (let i = 0; i < MAX_MEMBER_SLOTS; i++) {
    offsets.push(100 + i * 36);
    offsets.push(132 + i * 36);
  }

  const seen = new Set<string>();
  const vaults: string[] = [];

  const promises = offsets.map((offset) =>
    fetchOffset(connection, programId, offset, ownerBase58),
  );

  const results = await Promise.all(promises);

  for (const addrs of results) {
    for (const addr of addrs) {
      if (!seen.has(addr)) {
        seen.add(addr);
        vaults.push(addr);
      }
    }
  }

  return NextResponse.json({ vaults });
}
