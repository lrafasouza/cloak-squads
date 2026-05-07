import { getCurrentCluster } from "@/lib/cluster";
import { prisma } from "@/lib/prisma";
import { checkRateLimitAsync, rateLimitBucket } from "@/lib/rate-limit";
import { isCadence } from "@/lib/recurring-cadence";
import { SOL_MINT } from "@/lib/tokens";
import { requireVaultMember } from "@/lib/vault-membership";
import { MIN_PRIVATE_DEPOSIT_LAMPORTS } from "@cloak-squads/core/amount";
import { PublicKey } from "@solana/web3.js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  label: z.string().trim().min(1).max(80),
  recipient: z.string().refine(
    (v) => {
      try {
        new PublicKey(v);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid recipient address" },
  ),
  mode: z.enum(["bound", "bearer"]).default("bound"),
  amount: z.string().refine((v) => /^[0-9]+$/.test(v) && BigInt(v) > 0n, {
    message: "Amount must be a positive integer in base units",
  }),
  mint: z.string().min(32),
  cadence: z.string().refine(isCadence, { message: "Invalid cadence" }),
  nextDueAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
    message: "Invalid nextDueAt timestamp",
  }),
  vaultIndex: z.number().int().min(0).max(255).optional(),
  privacy: z.enum(["private", "public"]).default("private"),
});

export async function GET(_request: Request, context: { params: Promise<{ vault: string }> }) {
  const { vault } = await context.params;
  try {
    new PublicKey(vault);
  } catch {
    return NextResponse.json({ error: "Invalid vault address." }, { status: 400 });
  }

  const auth = await requireVaultMember(vault);
  if (auth instanceof NextResponse) return auth;

  const items = await prisma.recurringPayment.findMany({
    where: { cofreAddress: vault, cluster: getCurrentCluster(), status: { not: "cancelled" } },
    orderBy: [{ status: "asc" }, { nextDueAt: "asc" }],
  });

  return NextResponse.json(
    items.map((r) => ({
      id: r.id,
      cofreAddress: r.cofreAddress,
      vaultIndex: r.vaultIndex,
      label: r.label,
      recipient: r.recipient,
      mode: r.mode,
      amount: r.amount,
      mint: r.mint,
      cadence: r.cadence,
      nextDueAt: r.nextDueAt.toISOString(),
      lastRunAt: r.lastRunAt?.toISOString() ?? null,
      privacy: r.privacy,
      status: r.status,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    })),
  );
}

export async function POST(request: Request, context: { params: Promise<{ vault: string }> }) {
  const { vault } = await context.params;
  try {
    new PublicKey(vault);
  } catch {
    return NextResponse.json({ error: "Invalid vault address." }, { status: 400 });
  }

  const auth = await requireVaultMember(vault);
  if (auth instanceof NextResponse) return auth;

  const hdrs = await headers();
  const raw = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  const ip = (raw.split(",")[0] ?? raw).trim();
  if (
    !(await checkRateLimitAsync(rateLimitBucket(ip, "recurring-write", auth.publicKey), "write"))
  ) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (
    parsed.data.privacy === "private" &&
    parsed.data.mint === SOL_MINT &&
    BigInt(parsed.data.amount) < MIN_PRIVATE_DEPOSIT_LAMPORTS
  ) {
    return NextResponse.json(
      { error: "Amount is below the Cloak minimum of 0.01 SOL for private sends." },
      { status: 400 },
    );
  }

  const created = await prisma.recurringPayment.create({
    data: {
      cofreAddress: vault,
      cluster: getCurrentCluster(),
      vaultIndex: parsed.data.vaultIndex ?? 0,
      label: parsed.data.label,
      recipient: parsed.data.recipient,
      mode: parsed.data.mode,
      amount: parsed.data.amount,
      mint: parsed.data.mint,
      cadence: parsed.data.cadence,
      nextDueAt: new Date(parsed.data.nextDueAt),
      privacy: parsed.data.privacy,
      createdBy: auth.publicKey,
    },
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
