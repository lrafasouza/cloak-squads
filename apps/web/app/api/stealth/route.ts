import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { Prisma } from "@prisma/client";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import nacl from "tweetnacl";
import { z } from "zod";

const stealthInvoiceCreateSchema = z.object({
  cofreAddress: z.string().refine(
    (val) => {
      try {
        new PublicKey(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid cofre address" },
  ),
  invoiceRef: z.string().min(1).max(64).optional(),
  memo: z.string().max(256).optional(),
  amount: z.string().refine(
    (val) => /^[0-9]+$/.test(val) && BigInt(val) > 0n,
    { message: "Amount must be a positive integer in lamports" },
  ),
  recipientWallet: z.string().refine(
    (val) => {
      try {
        new PublicKey(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid recipient wallet address" },
  ),
});

function base64urlEncode(bytes: Uint8Array): string {
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function POST(request: Request) {
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

  const parsed = stealthInvoiceCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid stealth invoice request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { cofreAddress, invoiceRef, memo, amount, recipientWallet } = parsed.data;

    const stealthKp = nacl.box.keyPair();
    const stealthPubkey = bs58.encode(stealthKp.publicKey);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const invoice = await prisma.stealthInvoice.create({
      data: {
        cofreAddress,
        recipientWallet,
        invoiceRef: invoiceRef ?? null,
        memo: memo ?? null,
        stealthPubkey,
        amountHintEncrypted: Buffer.from(amount),
        status: "pending",
        expiresAt,
      },
    });

    const secretBase64url = base64urlEncode(stealthKp.secretKey);
    const claimUrl = `/claim/${invoice.id}#v=1&sk=${secretBase64url}&cofre=${cofreAddress}`;

    return NextResponse.json(
      {
        id: invoice.id,
        stealthPubkey,
        claimUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Stealth invoice already exists." }, { status: 409 });
    }
    console.error("[api/stealth] create failed:", error);
    return NextResponse.json({ error: "Could not create stealth invoice." }, { status: 500 });
  }
}
