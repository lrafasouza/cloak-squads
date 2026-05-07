-- Allow ProposalDraft to represent public (non-private) sends.
-- Public sends don't carry a payloadHash or commitment invariants, so make those
-- nullable. Add a `kind` column ("private" | "public") so the proposal page can
-- distinguish a private send from a plain transfer.

ALTER TABLE "ProposalDraft" ALTER COLUMN "payloadHash" DROP NOT NULL;
ALTER TABLE "ProposalDraft" ALTER COLUMN "invariants" DROP NOT NULL;
ALTER TABLE "ProposalDraft" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'private';
