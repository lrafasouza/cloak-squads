import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { requireVaultMember } from "@/lib/vault-membership";
import { PublicKey } from "@solana/web3.js";
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

  return NextResponse.json(limits);
}

export async function POST(req: Request, context: { params: Promise<{ multisig: string }> }) {
  const { multisig } = await context.params;

  const authError = await requireVaultMember(multisig);
  if (authError) return authError;

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
