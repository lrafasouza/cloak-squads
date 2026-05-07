import { prisma } from "@/lib/prisma";
import { requireVaultMember } from "@/lib/vault-membership";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ vault: string; linkId: string }> },
) {
  const { vault, linkId } = await context.params;

  try {
    new PublicKey(vault);
  } catch {
    return NextResponse.json({ error: "Invalid vault address." }, { status: 400 });
  }

  const auth = await requireVaultMember(vault);
  if (auth instanceof NextResponse) return auth;

  const link = await prisma.auditLink.findUnique({ where: { id: linkId } });
  if (!link || link.cofreAddress !== vault) {
    return NextResponse.json({ error: "Audit link not found for this vault." }, { status: 404 });
  }

  const entries = await prisma.auditAccessLog.findMany({
    where: { auditLinkId: linkId },
    orderBy: { accessedAt: "desc" },
    take: 50,
  });

  return NextResponse.json(
    entries.map((e) => ({
      id: e.id,
      action: e.action,
      ip: e.ip,
      userAgent: e.userAgent,
      accessedAt: e.accessedAt.toISOString(),
    })),
  );
}
