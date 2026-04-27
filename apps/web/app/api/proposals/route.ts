import { Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { serializeDraft } from "@/lib/serialize-proposal-draft";

const byteArraySchema = z.array(z.number().int().min(0).max(255));

const proposalDraftSchema = z.object({
  cofreAddress: z.string().min(32),
  transactionIndex: z.string().regex(/^\d+$/),
  amount: z.string().regex(/^\d+$/),
  recipient: z.string().min(32),
  memo: z.string().optional(),
  payloadHash: byteArraySchema.length(32),
  invariants: z.object({
    nullifier: byteArraySchema.length(32),
    commitment: byteArraySchema.length(32),
    amount: z.string().regex(/^\d+$/),
    tokenMint: z.string().min(32),
    recipientVkPub: byteArraySchema.length(32),
    nonce: byteArraySchema.length(16),
  }),
  commitmentClaim: z.unknown().optional(),
  signature: z.string().optional(),
});

export async function POST(request: Request) {
  const hdrs = await headers();
  const raw = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  const ip = raw.split(",")[0].trim();
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
    return NextResponse.json({ error: "Invalid proposal draft.", details: parsed.error.flatten() }, { status: 400 });
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
        commitmentClaim: parsed.data.commitmentClaim === undefined ? null : JSON.stringify(parsed.data.commitmentClaim),
        signature: parsed.data.signature ?? null,
      },
    });

    return NextResponse.json(serializeDraft(draft), { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "Proposal draft already exists." }, { status: 409 });
    }
    console.error("[api/proposals] create failed:", error);
    return NextResponse.json({ error: "Could not create proposal draft." }, { status: 500 });
  }
}
