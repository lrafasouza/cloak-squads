import { prisma } from "@/lib/prisma";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

export async function GET(_request: Request, context: { params: Promise<{ cofre: string }> }) {
  const { cofre } = await context.params;

  try {
    new PublicKey(cofre);
  } catch {
    return NextResponse.json({ error: "Invalid cofre address." }, { status: 400 });
  }

  try {
    const links = await prisma.auditLink.findMany({
      where: { cofreAddress: cofre },
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
