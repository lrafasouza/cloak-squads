import { prisma } from "@/lib/prisma";
import { serializeDraft } from "@/lib/serialize-proposal-draft";
import { requireWalletAuth } from "@/lib/wallet-auth";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

export async function GET(_request: Request, context: { params: Promise<{ multisig: string }> }) {
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  const { multisig } = await context.params;

  try {
    // Validate multisig address
    new PublicKey(multisig);
  } catch {
    return NextResponse.json({ error: "Invalid multisig address." }, { status: 400 });
  }

  try {
    const drafts = await prisma.proposalDraft.findMany({
      where: { cofreAddress: multisig },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(drafts.map(serializeDraft));
  } catch (error) {
    console.error("[api/proposals] list failed:", error);
    return NextResponse.json({ error: "Could not list proposal drafts." }, { status: 500 });
  }
}
