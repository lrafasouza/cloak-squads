import type { Prisma } from "@prisma/client";

export type ProposalDraftRow = Prisma.ProposalDraftGetPayload<Record<string, never>>;

type SerializeDraftOptions = {
  includeSensitive?: boolean;
};

export function serializeDraft(draft: ProposalDraftRow, options: SerializeDraftOptions = {}) {
  const { includeSensitive = false } = options;

  return {
    id: draft.id,
    cofreAddress: draft.cofreAddress,
    transactionIndex: draft.transactionIndex,
    amount: draft.amount,
    recipient: draft.recipient,
    memo: draft.memo ?? "",
    payloadHash: Array.from(Buffer.from(draft.payloadHash)),
    invariants: JSON.parse(draft.invariants),
    ...(includeSensitive && draft.commitmentClaim !== null
      ? { commitmentClaim: JSON.parse(draft.commitmentClaim) }
      : {}),
    signature: draft.signature ?? undefined,
    createdAt: new Date(draft.createdAt).toISOString(),
    archivedAt: draft.archivedAt ? new Date(draft.archivedAt).toISOString() : null,
  };
}
