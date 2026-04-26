-- CreateTable
CREATE TABLE "ProposalDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cofreAddress" TEXT NOT NULL,
    "transactionIndex" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "memo" TEXT,
    "payloadHash" BLOB NOT NULL,
    "invariants" TEXT NOT NULL,
    "commitmentClaim" TEXT,
    "signature" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ProposalDraft_cofreAddress_idx" ON "ProposalDraft"("cofreAddress");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalDraft_cofreAddress_transactionIndex_key" ON "ProposalDraft"("cofreAddress", "transactionIndex");
