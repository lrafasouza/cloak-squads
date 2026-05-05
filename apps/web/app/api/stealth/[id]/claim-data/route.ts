import { prisma } from "@/lib/prisma";
import { checkChallenge, consumeChallenge } from "@/lib/claim-challenge";
import { decryptField, isEncrypted } from "@/lib/field-crypto";
import { checkRateLimitAsync, rateLimitBucket } from "@/lib/rate-limit";
import { requireWalletAuth } from "@/lib/wallet-auth";
import bs58 from "bs58";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import nacl from "tweetnacl";
import { z } from "zod";

const claimDataSchema = z.object({
  challengeId: z.string().min(1),
  derivedPubkey: z.string().min(1),
  challengeSignature: z.string().min(1),
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
  if (!(await checkRateLimitAsync(rateLimitBucket(ip, "claim-data", auth.publicKey), "signature"))) {
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

    // All invoices must have signPubkey — legacy invoices were voided by migration.
    if (!invoice.signPubkey) {
      return NextResponse.json(
        { error: "Invoice is not eligible for claim (missing signing key). Please request a new invoice." },
        { status: 403 },
      );
    }

    // Step 1: Verify the derived public key matches the stored stealthPubkey
    if (parsed.data.derivedPubkey !== invoice.stealthPubkey) {
      return NextResponse.json(
        { error: "Derived public key does not match the invoice." },
        { status: 403 },
      );
    }

    // Step 2: Verify the challenge exists, is valid, and has not been used
    const challenge = checkChallenge(id, parsed.data.challengeId);
    if (!challenge) {
      return NextResponse.json(
        { error: "Invalid or expired challenge. Request a new challenge." },
        { status: 403 },
      );
    }

    // Step 3: Consume challenge (one-time use)
    const consumed = await consumeChallenge(id, parsed.data.challengeId);
    if (!consumed) {
      return NextResponse.json(
        { error: "Challenge already used. Request a new challenge." },
        { status: 403 },
      );
    }

    // Step 4: Verify the Ed25519 signature over the challenge nonce
    const signatureBytes = base64urlDecode(parsed.data.challengeSignature);
    const signPubkeyBytes = bs58.decode(invoice.signPubkey);

    const validSig = nacl.sign.detached.verify(
      challenge,
      signatureBytes,
      signPubkeyBytes,
    );

    if (!validSig) {
      return NextResponse.json(
        { error: "Invalid challenge signature." },
        { status: 403 },
      );
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

    const utxoPrivateKey = isEncrypted(invoice.utxoPrivateKey)
      ? decryptField(invoice.utxoPrivateKey)
      : invoice.utxoPrivateKey;
    const utxoBlinding = isEncrypted(invoice.utxoBlinding)
      ? decryptField(invoice.utxoBlinding)
      : invoice.utxoBlinding;

    return NextResponse.json({
      utxoAmount: invoice.utxoAmount,
      utxoPrivateKey,
      utxoBlinding,
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
