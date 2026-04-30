-- AlterTable: add archivedAt column for proposal archive (soft-delete)
ALTER TABLE "ProposalDraft" ADD COLUMN "archivedAt" TIMESTAMP;

-- CreateIndex: compound index for filtering by cofre + archive status
CREATE INDEX "ProposalDraft_cofreAddress_archivedAt_idx" ON "ProposalDraft"("cofreAddress", "archivedAt");
