import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { serializeDraft } from "@/lib/serialize-proposal-draft";
import { Prisma } from "@prisma/client";
import { PublicKey } from "@solana/web3.js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

const byteArraySchema = z.array(z.number().int().min(0).max(255));

const commitmentClaimSchema = z.object({
  amount: z.number().int().positive(),
  // Legacy fields (backward compat)
  r: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
  sk_spend: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
  // UTXO fields (new Cloak scheme)
  keypairPrivateKey: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
  keypairPublicKey: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
  blinding: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
  tokenMint: z.string().min(32).max(44).optional(),
  commitment: z.string().regex(/^[0-9a-fA-F]{64}$/),
  recipient_vk: z.string().min(32).max(44),
  token_mint: z.string().min(32).max(44),
});

const proposalDraftSchema = z.object({
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
  transactionIndex: z.string().regex(/^\d+$/),
  amount: z
    .string()
    .regex(/^\d+$/)
    .refine(
      (val) => {
        try {
          const n = BigInt(val);
          return n > 0n && n <= BigInt("18446744073709551615");
        } catch {
          return false;
        }
      },
      { message: "Amount out of valid range" },
    ),
  recipient: z.string().refine(
    (val) => {
      try {
        new PublicKey(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid recipient address" },
  ),
  memo: z.string().max(200).optional(),
  payloadHash: byteArraySchema.length(32),
  invariants: z.object({
    nullifier: byteArraySchema.length(32),
    commitment: byteArraySchema.length(32),
    amount: z.string().regex(/^\d+$/),
    tokenMint: z.string().refine(
      (val) => {
        try {
          new PublicKey(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Invalid token mint" },
    ),
    recipientVkPub: byteArraySchema.length(32),
    nonce: byteArraySchema.length(16),
  }),
  commitmentClaim: commitmentClaimSchema.optional(),
  signature: z.string().min(32).max(128).optional(),
});

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

  const parsed = proposalDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid proposal draft.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const draft = await prisma.proposalDraft.create({
      data: {
        cofreAddress: parsed.data.cofreAddress,
        transactionIndex: parsed.data.transactionIndex,
        amount: parsed.data.amount,
        recipient: parsed.data.recipient,
        memo: parsed.data.memo ?? null,
        payloadHash: Buffer.from(parsed.data.payloadHash),
        invariants: JSON.stringify(parsed.data.invariants),
        commitmentClaim:
          parsed.data.commitmentClaim === undefined
            ? null
            : JSON.stringify(parsed.data.commitmentClaim),
        signature: parsed.data.signature ?? null,
      },
    });

    return NextResponse.json(serializeDraft(draft), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Proposal draft already exists." }, { status: 409 });
    }
    console.error("[api/proposals] create failed:", error);
    return NextResponse.json({ error: "Could not create proposal draft." }, { status: 500 });
  }
}
