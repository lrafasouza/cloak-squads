import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { requireVaultMember } from "@/lib/vault-membership";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ multisig: string; index: string }> },
) {
  const { multisig, index } = await context.params;

  try {
    new PublicKey(multisig);
  } catch {
    return NextResponse.json({ error: "Invalid multisig address." }, { status: 400 });
  }

  const auth = await requireVaultMember(multisig);
  if (auth instanceof NextResponse) return auth;

  if (!isPrismaAvailable()) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  try {
    const draft = await prisma.swapDraft.findUnique({
      where: { cofreAddress_transactionIndex: { cofreAddress: multisig, transactionIndex: index } },
    });

    if (!draft) {
      return NextResponse.json({ error: "Swap draft not found." }, { status: 404 });
    }

    return NextResponse.json(draft);
  } catch (error) {
    console.error("[api/swaps] get failed:", error);
    return NextResponse.json({ error: "Could not load swap draft." }, { status: 500 });
  }
}
