import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

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

type ProposalDraftRow = {
  id: string;
  cofreAddress: string;
  transactionIndex: string;
  amount: string;
  recipient: string;
  memo: string | null;
  payloadHash: Uint8Array;
  invariants: string;
  commitmentClaim: string | null;
  signature: string | null;
  createdAt: Date | string;
};

function serializeDraft(draft: ProposalDraftRow) {
  return {
    id: draft.id,
    cofreAddress: draft.cofreAddress,
    transactionIndex: draft.transactionIndex,
    amount: draft.amount,
    recipient: draft.recipient,
    memo: draft.memo ?? "",
    payloadHash: Array.from(Buffer.from(draft.payloadHash)),
    invariants: JSON.parse(draft.invariants),
    commitmentClaim: draft.commitmentClaim ? JSON.parse(draft.commitmentClaim) : undefined,
    signature: draft.signature ?? undefined,
    createdAt: new Date(draft.createdAt).toISOString(),
  };
}

export async function POST(request: Request) {
  const parsed = proposalDraftSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid proposal draft.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const id = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO ProposalDraft (
        id,
        cofreAddress,
        transactionIndex,
        amount,
        recipient,
        memo,
        payloadHash,
        invariants,
        commitmentClaim,
        signature
      ) VALUES (
        ${id},
        ${parsed.data.cofreAddress},
        ${parsed.data.transactionIndex},
        ${parsed.data.amount},
        ${parsed.data.recipient},
        ${parsed.data.memo ?? null},
        ${Buffer.from(parsed.data.payloadHash)},
        ${JSON.stringify(parsed.data.invariants)},
        ${parsed.data.commitmentClaim === undefined ? null : JSON.stringify(parsed.data.commitmentClaim)},
        ${parsed.data.signature ?? null}
      )
    `;
    const [draft] = await prisma.$queryRaw<ProposalDraftRow[]>`
      SELECT * FROM ProposalDraft WHERE id = ${id} LIMIT 1
    `;
    if (!draft) {
      throw new Error("Inserted proposal draft could not be read back.");
    }

    return NextResponse.json(serializeDraft(draft), { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2010" &&
      String(error.meta?.message ?? "").includes("UNIQUE constraint failed")
    ) {
      return NextResponse.json({ error: "Proposal draft already exists." }, { status: 409 });
    }
    console.error("[api/proposals] create failed:", error);
    return NextResponse.json({ error: "Could not create proposal draft." }, { status: 500 });
  }
}
