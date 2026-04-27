import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
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

const payrollRecipientSchema = z.object({
  name: z.string().min(1).max(100),
  wallet: z.string().refine(
    (val) => {
      try {
        return PublicKey.isOnCurve(new PublicKey(val).toBytes());
      } catch {
        return false;
      }
    },
    { message: "Invalid Solana wallet address" },
  ),
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
  memo: z.string().max(200).optional(),
  payloadHash: byteArraySchema.length(32),
  invariants: z.object({
    nullifier: byteArraySchema.length(32),
    commitment: byteArraySchema.length(32),
    amount: z.string().regex(/^\d+$/),
    tokenMint: z.string().refine(
      (val) => {
        try {
          return PublicKey.isOnCurve(new PublicKey(val).toBytes());
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

const payrollDraftSchema = z.object({
  cofreAddress: z.string().refine(
    (val) => {
      try {
        return PublicKey.isOnCurve(new PublicKey(val).toBytes());
      } catch {
        return false;
      }
    },
    { message: "Invalid cofre address" },
  ),
  transactionIndex: z.string().regex(/^\d+$/),
  memo: z.string().max(200).optional(),
  totalAmount: z
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
      { message: "Total amount out of valid range" },
    ),
  recipients: z.array(payrollRecipientSchema).min(1).max(10),
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

  const parsed = payrollDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payroll draft.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const draft = await prisma.payrollDraft.create({
      data: {
        cofreAddress: parsed.data.cofreAddress,
        transactionIndex: parsed.data.transactionIndex,
        memo: parsed.data.memo ?? null,
        totalAmount: parsed.data.totalAmount,
        recipientCount: parsed.data.recipients.length,
        recipients: {
          create: parsed.data.recipients.map((r) => ({
            name: r.name,
            wallet: r.wallet,
            amount: r.amount,
            memo: r.memo ?? null,
            payloadHash: Buffer.from(r.payloadHash),
            invariants: JSON.stringify(r.invariants),
            commitmentClaim:
              r.commitmentClaim === undefined ? null : JSON.stringify(r.commitmentClaim),
            signature: r.signature ?? null,
          })),
        },
      },
      include: { recipients: true },
    });

    return NextResponse.json(
      {
        id: draft.id,
        cofreAddress: draft.cofreAddress,
        transactionIndex: draft.transactionIndex,
        memo: draft.memo ?? undefined,
        totalAmount: draft.totalAmount,
        recipientCount: draft.recipientCount,
        recipients: draft.recipients.map((r) => ({
          id: r.id,
          name: r.name,
          wallet: r.wallet,
          amount: r.amount,
          memo: r.memo ?? undefined,
          payloadHash: Array.from(Buffer.from(r.payloadHash)),
          invariants: JSON.parse(r.invariants),
          commitmentClaim: r.commitmentClaim !== null ? JSON.parse(r.commitmentClaim) : undefined,
          signature: r.signature ?? undefined,
        })),
        createdAt: new Date(draft.createdAt).toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Payroll draft already exists." }, { status: 409 });
    }
    console.error("[api/payrolls] create failed:", error);
    return NextResponse.json({ error: "Could not create payroll draft." }, { status: 500 });
  }
}
