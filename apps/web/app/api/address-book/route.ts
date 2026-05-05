import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { checkRateLimitAsync, rateLimitBucket } from "@/lib/rate-limit";
import { requireWalletAuth } from "@/lib/wallet-auth";
import { PublicKey } from "@solana/web3.js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  label: z.string().trim().min(1).max(64),
  address: z.string().trim().min(32).max(44),
  notes: z.string().trim().max(280).optional(),
});

export async function GET() {
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  if (!isPrismaAvailable()) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  try {
    const entries = await prisma.addressBookEntry.findMany({
      where: { ownerPubkey: auth.publicKey },
      orderBy: { label: "asc" },
    });
    return NextResponse.json({ entries });
  } catch (error) {
    console.error("[api/address-book] list failed:", error);
    return NextResponse.json({ error: "Could not load address book." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  const hdrs = await headers();
  const raw = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  const ip = (raw.split(",")[0] ?? raw).trim();
  if (!(await checkRateLimitAsync(rateLimitBucket(ip, "addr-write", auth.publicKey), "write"))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  if (!isPrismaAvailable()) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Validate address is a real Solana pubkey
  try {
    new PublicKey(parsed.data.address);
  } catch {
    return NextResponse.json({ error: "Invalid Solana address." }, { status: 400 });
  }

  try {
    const entry = await prisma.addressBookEntry.upsert({
      where: {
        ownerPubkey_address: {
          ownerPubkey: auth.publicKey,
          address: parsed.data.address,
        },
      },
      update: {
        label: parsed.data.label,
        notes: parsed.data.notes ?? null,
      },
      create: {
        ownerPubkey: auth.publicKey,
        label: parsed.data.label,
        address: parsed.data.address,
        notes: parsed.data.notes ?? null,
      },
    });
    return NextResponse.json({ entry });
  } catch (error) {
    console.error("[api/address-book] create failed:", error);
    return NextResponse.json({ error: "Could not save address book entry." }, { status: 500 });
  }
}
