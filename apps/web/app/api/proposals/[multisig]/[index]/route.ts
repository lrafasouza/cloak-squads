import { prisma } from "@/lib/prisma";
import { serializeDraft } from "@/lib/serialize-proposal-draft";
import { requireWalletAuth } from "@/lib/wallet-auth";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ multisig: string; index: string }> },
) {
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  const { multisig, index } = await context.params;

  try {
    // Validate multisig address
    new PublicKey(multisig);
  } catch {
    return NextResponse.json({ error: "Invalid multisig address." }, { status: 400 });
  }

  try {
    const draft = await prisma.proposalDraft.findUnique({
      where: { cofreAddress_transactionIndex: { cofreAddress: multisig, transactionIndex: index } },
    });

    if (!draft) {
      return NextResponse.json({ error: "Proposal draft not found." }, { status: 404 });
    }

    return NextResponse.json(serializeDraft(draft));
  } catch (error) {
    console.error("[api/proposals] get failed:", error);
    return NextResponse.json({ error: "Could not load proposal draft." }, { status: 500 });
  }
}
