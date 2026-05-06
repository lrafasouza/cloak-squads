import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { requireVaultMember } from "@/lib/vault-membership";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(8).optional(),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ multisig: string; vaultIndex: string }> },
) {
  const { multisig, vaultIndex: vaultIndexStr } = await context.params;
  const vaultIndex = Number(vaultIndexStr);

  if (!Number.isInteger(vaultIndex) || vaultIndex < 0) {
    return NextResponse.json({ error: "Invalid vault index." }, { status: 400 });
  }

  try {
    new PublicKey(multisig);
  } catch {
    return NextResponse.json({ error: "Invalid vault address." }, { status: 400 });
  }

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

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, color, icon } = parsed.data;
  const updateData: { name?: string; color?: string | null; icon?: string | null } = {};
  if (name !== undefined) updateData.name = name;
  if ("color" in parsed.data) updateData.color = color ?? null;
  if ("icon" in parsed.data) updateData.icon = icon ?? null;

  const updated = await prisma.subVault.update({
    where: { cofreAddress_vaultIndex: { cofreAddress: multisig, vaultIndex } },
    data: updateData,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ multisig: string; vaultIndex: string }> },
) {
  const { multisig, vaultIndex: vaultIndexStr } = await context.params;
  const vaultIndex = Number(vaultIndexStr);

  if (!Number.isInteger(vaultIndex) || vaultIndex < 0) {
    return NextResponse.json({ error: "Invalid vault index." }, { status: 400 });
  }

  if (vaultIndex === 0) {
    return NextResponse.json({ error: "Cannot delete main vault (index 0)." }, { status: 400 });
  }

  try {
    new PublicKey(multisig);
  } catch {
    return NextResponse.json({ error: "Invalid vault address." }, { status: 400 });
  }

  const authError = await requireVaultMember(multisig);
  if (authError) return authError;

  if (!isPrismaAvailable()) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  await prisma.subVault.delete({
    where: { cofreAddress_vaultIndex: { cofreAddress: multisig, vaultIndex } },
  });

  return new NextResponse(null, { status: 204 });
}
