import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

export async function GET(
  _request: Request,
  context: { params: Promise<{ multisig: string; index: string }> },
) {
  const { multisig, index } = await context.params;
  const [draft] = await prisma.$queryRaw<ProposalDraftRow[]>`
    SELECT * FROM ProposalDraft
    WHERE cofreAddress = ${multisig} AND transactionIndex = ${index}
    LIMIT 1
  `;

  if (!draft) {
    return NextResponse.json({ error: "Proposal draft not found." }, { status: 404 });
  }

  return NextResponse.json(serializeDraft(draft));
}
