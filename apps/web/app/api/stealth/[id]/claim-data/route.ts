import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireWalletAuth } from "@/lib/wallet-auth";
import bs58 from "bs58";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import nacl from "tweetnacl";
import { z } from "zod";

const claimDataSchema = z.object({
  accessKey: z.string().min(1),
});

function base64urlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + padding;
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  const hdrs = await headers();
  const raw = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  const ip = (raw.split(",")[0] ?? raw).trim();
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = claimDataSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid claim data request." }, { status: 400 });
  }

  try {
    const { id } = await params;
    const invoice = await prisma.stealthInvoice.findUnique({ where: { id } });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    if (invoice.recipientWallet !== auth.publicKey) {
      return NextResponse.json(
        { error: "Connected wallet is not the invoice recipient." },
        { status: 403 },
      );
    }

    let accessSecret: Uint8Array;
    try {
      accessSecret = base64urlDecode(parsed.data.accessKey);
    } catch {
      return NextResponse.json({ error: "Invalid invoice access key." }, { status: 400 });
    }

    if (accessSecret.length !== nacl.box.secretKeyLength) {
      return NextResponse.json({ error: "Invalid invoice access key." }, { status: 400 });
    }

    const accessKeypair = nacl.box.keyPair.fromSecretKey(accessSecret);
    if (bs58.encode(accessKeypair.publicKey) !== invoice.stealthPubkey) {
      return NextResponse.json({ error: "Invalid invoice access key." }, { status: 403 });
    }

    if (invoice.status === "claimed") {
      return NextResponse.json(
        { error: "This invoice has already been claimed." },
        { status: 409 },
      );
    }

    if (invoice.status === "voided") {
      return NextResponse.json({ error: "This invoice has been voided." }, { status: 409 });
    }

    if (invoice.expiresAt < new Date()) {
      return NextResponse.json({ error: "This invoice has expired." }, { status: 409 });
    }

    if (
      !invoice.utxoAmount ||
      !invoice.utxoPrivateKey ||
      !invoice.utxoBlinding ||
      !invoice.utxoMint ||
      !invoice.utxoCommitment
    ) {
      return NextResponse.json(
        {
          error:
            "Invoice UTXO data is missing. The invoice may not have been funded on-chain yet. Please verify the deposit was completed before claiming.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      utxoAmount: invoice.utxoAmount,
      utxoPrivateKey: invoice.utxoPrivateKey,
      utxoBlinding: invoice.utxoBlinding,
      utxoMint: invoice.utxoMint,
      utxoLeafIndex: invoice.utxoLeafIndex,
      utxoCommitment: invoice.utxoCommitment,
      utxoSiblingCommitment: invoice.utxoSiblingCommitment,
      utxoLeftSiblingCommitment: invoice.utxoLeftSiblingCommitment,
    });
  } catch (error) {
    console.error("[api/stealth/claim-data] failed:", error);
    return NextResponse.json({ error: "Could not load invoice claim data." }, { status: 500 });
  }
}
