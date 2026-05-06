import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { requireVaultMember } from "@/lib/vault-membership";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ multisig: string; id: string }> },
) {
  const { multisig, id } = await context.params;

  try { new PublicKey(multisig); } catch {
    return NextResponse.json({ error: "Invalid vault address." }, { status: 400 });
  }

  const authError = await requireVaultMember(multisig);
  if (authError) return authError;

  if (!isPrismaAvailable()) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  await prisma.spendingLimit.update({
    where: { id },
    data: { status: "removed" },
  });

  return new NextResponse(null, { status: 204 });
}
