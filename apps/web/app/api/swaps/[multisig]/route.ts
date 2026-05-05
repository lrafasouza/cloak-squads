import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ multisig: string }> },
) {
  const { multisig } = await context.params;

  try {
    new PublicKey(multisig);
  } catch {
    return NextResponse.json({ error: "Invalid multisig address." }, { status: 400 });
  }

  if (!isPrismaAvailable()) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  try {
    const drafts = await prisma.swapDraft.findMany({
      where: { cofreAddress: multisig },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(drafts);
  } catch (error) {
    console.error("[api/swaps] list failed:", error);
    return NextResponse.json({ error: "Could not load swap drafts." }, { status: 500 });
  }
}
