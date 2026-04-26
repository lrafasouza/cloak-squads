import { Prisma } from "@prisma/client";

export type ProposalDraftRow = Prisma.ProposalDraftGetPayload<{}>;

export function serializeDraft(draft: ProposalDraftRow) {
  return {
    id: draft.id,
    cofreAddress: draft.cofreAddress,
    transactionIndex: draft.transactionIndex,
    amount: draft.amount,
    recipient: draft.recipient,
    memo: draft.memo ?? "",
    payloadHash: Array.from(Buffer.from(draft.payloadHash)),
    invariants: JSON.parse(draft.invariants),
    commitmentClaim: draft.commitmentClaim !== null ? JSON.parse(draft.commitmentClaim) : undefined,
    signature: draft.signature ?? undefined,
    createdAt: new Date(draft.createdAt).toISOString(),
  };
}
