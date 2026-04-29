-- CreateTable
CREATE TABLE "AuditLink" (
    "id" TEXT NOT NULL,
    "cofreAddress" TEXT NOT NULL,
    "diversifier" BYTEA NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeParams" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "signature" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StealthInvoice" (
    "id" TEXT NOT NULL,
    "cofreAddress" TEXT NOT NULL,
    "recipientWallet" TEXT,
    "invoiceRef" TEXT,
    "memo" TEXT,
    "stealthPubkey" TEXT NOT NULL,
    "amountHintEncrypted" BYTEA,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "claimedBy" TEXT,
    "utxoAmount" TEXT,
    "utxoPrivateKey" TEXT,
    "utxoPublicKey" TEXT,
    "utxoBlinding" TEXT,
    "utxoMint" TEXT,
    "utxoLeafIndex" INTEGER,
    "utxoCommitment" TEXT,

    CONSTRAINT "StealthInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalDraft" (
    "id" TEXT NOT NULL,
    "cofreAddress" TEXT NOT NULL,
    "transactionIndex" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "memo" TEXT,
    "payloadHash" BYTEA NOT NULL,
    "invariants" TEXT NOT NULL,
    "commitmentClaim" TEXT,
    "signature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollDraft" (
    "id" TEXT NOT NULL,
    "cofreAddress" TEXT NOT NULL,
    "transactionIndex" TEXT NOT NULL,
    "memo" TEXT,
    "totalAmount" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'direct',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRecipient" (
    "id" TEXT NOT NULL,
    "payrollDraftId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "memo" TEXT,
    "payloadHash" BYTEA NOT NULL,
    "invariants" TEXT NOT NULL,
    "commitmentClaim" TEXT,
    "invoiceId" TEXT,
    "signature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLink_cofreAddress_idx" ON "AuditLink"("cofreAddress");

-- CreateIndex
CREATE INDEX "StealthInvoice_cofreAddress_idx" ON "StealthInvoice"("cofreAddress");

-- CreateIndex
CREATE INDEX "StealthInvoice_stealthPubkey_idx" ON "StealthInvoice"("stealthPubkey");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalDraft_cofreAddress_transactionIndex_key" ON "ProposalDraft"("cofreAddress", "transactionIndex");

-- CreateIndex
CREATE INDEX "ProposalDraft_cofreAddress_idx" ON "ProposalDraft"("cofreAddress");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollDraft_cofreAddress_transactionIndex_key" ON "PayrollDraft"("cofreAddress", "transactionIndex");

-- CreateIndex
CREATE INDEX "PayrollDraft_cofreAddress_idx" ON "PayrollDraft"("cofreAddress");

-- CreateIndex
CREATE INDEX "PayrollRecipient_payrollDraftId_idx" ON "PayrollRecipient"("payrollDraftId");

-- AddForeignKey
ALTER TABLE "PayrollRecipient" ADD CONSTRAINT "PayrollRecipient_payrollDraftId_fkey" FOREIGN KEY ("payrollDraftId") REFERENCES "PayrollDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
