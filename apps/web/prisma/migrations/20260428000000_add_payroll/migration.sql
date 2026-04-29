-- CreateTable
CREATE TABLE "PayrollDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cofreAddress" TEXT NOT NULL,
    "transactionIndex" TEXT NOT NULL,
    "memo" TEXT,
    "totalAmount" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PayrollRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payrollDraftId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "memo" TEXT,
    "payloadHash" BLOB NOT NULL,
    "invariants" TEXT NOT NULL,
    "commitmentClaim" TEXT,
    "signature" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollRecipient_payrollDraftId_fkey" FOREIGN KEY ("payrollDraftId") REFERENCES "PayrollDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollDraft_cofreAddress_transactionIndex_key" ON "PayrollDraft"("cofreAddress", "transactionIndex");

-- CreateIndex
CREATE INDEX "PayrollDraft_cofreAddress_idx" ON "PayrollDraft"("cofreAddress");

-- CreateIndex
CREATE INDEX "PayrollRecipient_payrollDraftId_idx" ON "PayrollRecipient"("payrollDraftId");
