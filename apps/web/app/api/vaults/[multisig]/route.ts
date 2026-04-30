import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

export async function GET(_request: Request, context: { params: Promise<{ multisig: string }> }) {
  const { multisig } = await context.params;

  try {
    new PublicKey(multisig);
  } catch {
    return NextResponse.json({ error: "Invalid vault address." }, { status: 400 });
  }

  if (!isPrismaAvailable()) {
    return NextResponse.json(null);
  }

  try {
    const vault = await prisma.vault.findUnique({
      where: { cofreAddress: multisig },
    });

    return NextResponse.json(vault);
  } catch (error) {
    console.error("[api/vaults] read failed:", error);
    return NextResponse.json({ error: "Could not load vault metadata." }, { status: 500 });
  }
}
