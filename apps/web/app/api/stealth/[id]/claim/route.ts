import { prisma } from "@/lib/prisma";
import { checkRateLimitAsync, rateLimitBucket } from "@/lib/rate-limit";
import { requireWalletAuth } from "@/lib/wallet-auth";
import { PublicKey } from "@solana/web3.js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  const hdrs = await headers();
  const raw = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  const ip = (raw.split(",")[0] ?? raw).trim();
  if (!(await checkRateLimitAsync(rateLimitBucket(ip, "stealth-claim", auth.publicKey), "write"))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const { claimedBy } = body as { claimedBy?: unknown };
    if (!claimedBy || typeof claimedBy !== "string") {
      return NextResponse.json({ error: "claimedBy is required" }, { status: 400 });
    }

    try {
      new PublicKey(claimedBy);
    } catch {
      return NextResponse.json({ error: "Invalid claimedBy address." }, { status: 400 });
    }

    if (claimedBy !== auth.publicKey) {
      return NextResponse.json(
        { error: "claimedBy must match the authenticated wallet." },
        { status: 403 },
      );
    }

    const existing = await prisma.stealthInvoice.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    if (existing.recipientWallet !== auth.publicKey) {
      return NextResponse.json(
        { error: "Connected wallet is not the invoice recipient." },
        { status: 403 },
      );
    }

    if (
      !existing.utxoAmount ||
      !existing.utxoPrivateKey ||
      !existing.utxoBlinding ||
      !existing.utxoMint ||
      !existing.utxoCommitment
    ) {
      return NextResponse.json(
        {
          error:
            "Invoice UTXO data is missing. The invoice cannot be marked claimed before it is funded on-chain.",
        },
        { status: 409 },
      );
    }

    const invoice = await prisma.stealthInvoice.update({
      where: { id },
      data: { status: "claimed", claimedAt: new Date(), claimedBy },
      select: { id: true, status: true, claimedAt: true },
    });

    return NextResponse.json(invoice);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not claim invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
