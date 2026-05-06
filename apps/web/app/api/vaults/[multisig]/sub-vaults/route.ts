import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { requireVaultMember } from "@/lib/vault-membership";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  vaultIndex: z.number().int().min(0).max(255),
  name: z.string().min(1).max(64),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(8).optional(),
});

export async function GET(_req: Request, context: { params: Promise<{ multisig: string }> }) {
  const { multisig } = await context.params;

  try {
    new PublicKey(multisig);
  } catch {
    return NextResponse.json({ error: "Invalid vault address." }, { status: 400 });
  }

  if (!isPrismaAvailable()) return NextResponse.json([]);

  const subVaults = await prisma.subVault.findMany({
    where: { cofreAddress: multisig },
    orderBy: { vaultIndex: "asc" },
  });

  return NextResponse.json(subVaults);
}

export async function POST(req: Request, context: { params: Promise<{ multisig: string }> }) {
  const { multisig } = await context.params;

  const authError = await requireVaultMember(multisig);
  if (authError) return authError;

  if (!isPrismaAvailable()) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { vaultIndex, name, color, icon } = parsed.data;

  const existing = await prisma.subVault.findUnique({
    where: { cofreAddress_vaultIndex: { cofreAddress: multisig, vaultIndex } },
  });
  if (existing) {
    return NextResponse.json({ error: "Sub-vault index already exists." }, { status: 409 });
  }

  const subVault = await prisma.subVault.create({
    data: {
      cofreAddress: multisig,
      vaultIndex,
      name,
      color: color ?? null,
      icon: icon ?? null,
    },
  });

  return NextResponse.json(subVault, { status: 201 });
}
