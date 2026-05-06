import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { requireVaultMember } from "@/lib/vault-membership";
import { Connection, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { z } from "zod";

const pubkeyStr = z.string().refine((v) => {
  try { new PublicKey(v); return true; } catch { return false; }
}, "Invalid public key");

const createSchema = z.object({
  spendingLimit: pubkeyStr,
  createKey: pubkeyStr,
  vaultIndex: z.number().int().min(0),
  mint: pubkeyStr,
  amountRaw: z.string().regex(/^\d+$/),
  period: z.enum(["OneTime", "Day", "Week", "Month"]),
  members: z.array(pubkeyStr),
  destinations: z.array(pubkeyStr),
});

const RPC_URL =
  process.env.FALLBACK_RPC_URL ??
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://api.devnet.solana.com";
const SQUADS_PROGRAM_ID = process.env.NEXT_PUBLIC_SQUADS_PROGRAM_ID ?? "";

export async function GET(_req: Request, context: { params: Promise<{ multisig: string }> }) {
  const { multisig } = await context.params;

  try { new PublicKey(multisig); } catch {
    return NextResponse.json({ error: "Invalid vault address." }, { status: 400 });
  }

  if (!isPrismaAvailable()) return NextResponse.json([]);

  const limits = await prisma.spendingLimit.findMany({
    where: { cofreAddress: multisig, status: "active" },
    orderBy: { createdAt: "desc" },
  });

  // Reconcile DB with on-chain truth: an "active" row in DB only means a proposal
  // was created — the actual SpendingLimit PDA only exists once the proposal is
  // approved + executed. SendModal must NOT offer a limit that doesn't exist
  // on-chain (would fail with NotEnoughKeys / AccountNotInitialized).
  let squadsProgram: PublicKey;
  try {
    squadsProgram = new PublicKey(SQUADS_PROGRAM_ID);
  } catch {
    // If we can't validate, return DB rows untouched — fail open rather than
    // hiding limits the user expects to see.
    return NextResponse.json(limits.map((l) => ({ ...l, onChainExists: true })));
  }

  if (limits.length === 0) return NextResponse.json([]);

  const connection = new Connection(RPC_URL, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
  });

  let accountInfos: Array<Awaited<ReturnType<typeof connection.getAccountInfo>>> = [];
  try {
    const pdas = limits.map((l) => new PublicKey(l.spendingLimit));
    accountInfos = await connection.getMultipleAccountsInfo(pdas, "confirmed");
  } catch (err) {
    console.warn("[spending-limits] on-chain reconcile failed, falling back to DB:", err);
    return NextResponse.json(limits.map((l) => ({ ...l, onChainExists: true })));
  }

  const decorated = limits.map((l, i) => {
    const acct = accountInfos[i];
    const onChainExists = !!acct && acct.owner.equals(squadsProgram);
    return { ...l, onChainExists };
  });

  return NextResponse.json(decorated);
}

export async function POST(req: Request, context: { params: Promise<{ multisig: string }> }) {
  const { multisig } = await context.params;

  const auth = await requireVaultMember(multisig);
  if (auth instanceof NextResponse) return auth;

  if (!isPrismaAvailable()) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const limit = await prisma.spendingLimit.create({
    data: { cofreAddress: multisig, ...parsed.data },
  });

  return NextResponse.json(limit, { status: 201 });
}
