import { prisma } from "@/lib/prisma";
import { requireWalletAuth } from "@/lib/wallet-auth";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

export async function GET(_request: Request, context: { params: Promise<{ vault: string }> }) {
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  const { vault } = await context.params;

  try {
    new PublicKey(vault);
  } catch {
    return NextResponse.json({ error: "Invalid vault address." }, { status: 400 });
  }

  try {
    const links = await prisma.auditLink.findMany({
      where: { cofreAddress: vault },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(
      links.map((link) => ({
        id: link.id,
        cofreAddress: link.cofreAddress,
        scope: link.scope,
        scopeParams: link.scopeParams,
        expiresAt: link.expiresAt.toISOString(),
        issuedBy: link.issuedBy,
        createdAt: link.createdAt.toISOString(),
      })),
    );
  } catch (error) {
    console.error("[api/audit-links] list failed:", error);
    return NextResponse.json({ error: "Could not list audit links." }, { status: 500 });
  }
}
