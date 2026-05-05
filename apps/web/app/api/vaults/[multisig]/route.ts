import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { getMultisigMembers, requireVaultMember } from "@/lib/vault-membership";
import { verifyWalletAuth } from "@/lib/wallet-auth";
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
    // Check if caller is an authenticated vault member — if so, include sensitive settings.
    // Public callers (vault metadata enrichment, etc.) still get basic info without secrets.
    const authResult = await verifyWalletAuth();
    let isMember = false;
    if (authResult.ok) {
      try {
        const { members } = await getMultisigMembers(multisig);
        isMember = members.includes(authResult.publicKey);
      } catch {
        // RPC unavailable — treat as non-member for settings
      }
    }

    const vault = await prisma.vault.findUnique({
      where: { cofreAddress: multisig },
      include: { settings: isMember },
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
  webhookUrl: z.string().trim().url().max(500).nullable().optional(),
  rpcOverride: z.string().trim().url().max(500).nullable().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ multisig: string }> }) {
  const { multisig } = await context.params;

  try {
    new PublicKey(multisig);
  } catch {
    return NextResponse.json({ error: "Invalid vault address." }, { status: 400 });
  }

  const auth = await requireVaultMember(multisig);
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

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const data = parsed.data;

    const hasSettings = data.webhookUrl !== undefined || data.rpcOverride !== undefined;

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
          ...(hasSettings
            ? {
                settings: {
                  upsert: {
                    create: {
                      webhookUrl: data.webhookUrl ?? null,
                      rpcOverride: data.rpcOverride ?? null,
                    },
                    update: {
                      ...(data.webhookUrl !== undefined ? { webhookUrl: data.webhookUrl } : {}),
                      ...(data.rpcOverride !== undefined ? { rpcOverride: data.rpcOverride } : {}),
                    },
                  },
                },
              }
            : {}),
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
          ...(hasSettings
            ? {
                settings: {
                  create: {
                    webhookUrl: data.webhookUrl ?? null,
                    rpcOverride: data.rpcOverride ?? null,
                  },
                },
              }
            : {}),
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
    const message =
      error instanceof Prisma.PrismaClientKnownRequestError
        ? `[${error.code}] ${error.message}`
        : error instanceof Error
          ? error.message
          : "Could not update vault.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
