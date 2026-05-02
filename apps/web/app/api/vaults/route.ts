import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { requireWalletAuth } from "@/lib/wallet-auth";
import { Prisma } from "@prisma/client";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { z } from "zod";

const vaultMetadataSchema = z.object({
  cofreAddress: z.string().refine(
    (value) => {
      try {
        new PublicKey(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid vault address" },
  ),
  name: z.string().trim().min(1).max(32),
  description: z.string().trim().max(64).optional(),
  avatarUrl: z.string().trim().max(350_000).optional(),
});

export async function POST(request: Request) {
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  if (!isPrismaAvailable()) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = vaultMetadataSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid vault metadata.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const vault = await prisma.vault.upsert({
      where: { cofreAddress: parsed.data.cofreAddress },
      create: {
        cofreAddress: parsed.data.cofreAddress,
        name: parsed.data.name,
        description: parsed.data.description || null,
        avatarUrl: parsed.data.avatarUrl || null,
        createdBy: auth.publicKey,
      },
      update: {
        name: parsed.data.name,
        description: parsed.data.description || null,
        avatarUrl: parsed.data.avatarUrl || null,
      },
    });

    return NextResponse.json(vault, { status: 201 });
  } catch (error) {
    console.error("[api/vaults] upsert failed:", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P1001") {
      return NextResponse.json(
        { error: "Database unavailable.", details: "Could not reach the local Postgres server." },
        { status: 503 },
      );
    }

    return NextResponse.json({ error: "Could not save vault metadata." }, { status: 500 });
  }
}
