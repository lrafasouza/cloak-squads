import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { requireWalletAuth } from "@/lib/wallet-auth";
import { Prisma } from "@prisma/client";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { z } from "zod";

/* ── GET: list vaults ──
 *
 * ?addresses=addr1,addr2 → public: returns DB metadata for those addresses
 *   (no auth required — used to enrich on-chain scan results).
 * No params → auth required: returns vaults created by the wallet.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const addressesParam = searchParams.get("addresses");

  if (addressesParam) {
    return getVaultsByAddresses(addressesParam);
  }

  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;
  return getVaultsByCreator(auth.publicKey);
}

async function getVaultsByAddresses(addressesParam: string) {
  if (!isPrismaAvailable()) {
    return NextResponse.json({ vaults: [] });
  }

  const addresses = addressesParam.split(",").filter(Boolean);

  try {
    const vaults = await prisma.vault.findMany({
      where: { cofreAddress: { in: addresses } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ vaults });
  } catch (error) {
    console.error("[api/vaults] address lookup failed:", error);
    return NextResponse.json({ vaults: [] });
  }
}

async function getVaultsByCreator(publicKey: string) {
  if (!isPrismaAvailable()) {
    return NextResponse.json({ vaults: [] });
  }

  try {
    const vaults = await prisma.vault.findMany({
      where: { createdBy: publicKey },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ vaults });
  } catch (error) {
    console.error("[api/vaults] list failed:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P1001") {
      return NextResponse.json({ error: "Database unavailable.", vaults: [] }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not load vaults.", vaults: [] }, { status: 500 });
  }
}

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
        description: parsed.data.description ?? null,
        avatarUrl: parsed.data.avatarUrl ?? null,
        createdBy: auth.publicKey,
      },
      update: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        avatarUrl: parsed.data.avatarUrl ?? null,
      },
    });

    return NextResponse.json(vault, { status: 201 });
  } catch (error) {
    console.error("[api/vaults] upsert failed:", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P1001") {
        return NextResponse.json(
          { error: "Database unavailable.", details: "Could not reach the local Postgres server." },
          { status: 503 },
        );
      }
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "Vault already exists.", cofreAddress: parsed.data.cofreAddress },
          { status: 409 },
        );
      }
    }

    const message = error instanceof Error ? error.message : "Could not save vault metadata.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
