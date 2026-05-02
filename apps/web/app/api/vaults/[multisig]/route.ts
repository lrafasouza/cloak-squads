import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P1001") {
      return NextResponse.json(
        { error: "Database unavailable.", details: "Could not reach the local Postgres server." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Could not load vault metadata." }, { status: 500 });
  }
}
