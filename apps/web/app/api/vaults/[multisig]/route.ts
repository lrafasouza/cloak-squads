import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { requireWalletAuth } from "@/lib/wallet-auth";
import { Prisma } from "@prisma/client";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { z } from "zod";

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
      include: { settings: true },
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

const updateSchema = z.object({
  name: z.string().trim().min(1).max(32).optional(),
  description: z.string().trim().max(64).optional(),
  avatarUrl: z.string().trim().max(350_000).optional(),
  emailNotifications: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ multisig: string }> }) {
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  const { multisig } = await context.params;

  try {
    new PublicKey(multisig);
  } catch {
    return NextResponse.json({ error: "Invalid vault address." }, { status: 400 });
  }

  if (!isPrismaAvailable()) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const data = parsed.data;

    const existing = await prisma.vault.findUnique({ where: { cofreAddress: multisig } });

    let result: Record<string, unknown>;
    if (existing) {
      result = await prisma.vault.update({
        where: { cofreAddress: multisig },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description || null } : {}),
          ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl || null } : {}),
          ...(data.emailNotifications !== undefined ? { emailNotifications: data.emailNotifications } : {}),
        },
        include: { settings: true },
      });
    } else {
      result = await prisma.vault.create({
        data: {
          cofreAddress: multisig,
          name: data.name ?? "Untitled",
          description: data.description ?? null,
          avatarUrl: data.avatarUrl ?? null,
          createdBy: auth.publicKey,
          ...(data.emailNotifications !== undefined ? { emailNotifications: data.emailNotifications } : {}),
        },
        include: { settings: true },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/vaults] update failed:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P1001") {
      return NextResponse.json(
        { error: "Database unavailable.", details: "Could not reach the local Postgres server." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Could not update vault." }, { status: 500 });
  }
}
