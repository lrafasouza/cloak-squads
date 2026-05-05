-- CreateTable
CREATE TABLE "SwapDraft" (
    "id" TEXT NOT NULL,
    "cofreAddress" TEXT NOT NULL,
    "transactionIndex" TEXT NOT NULL,
    "inputMint" TEXT NOT NULL,
    "outputMint" TEXT NOT NULL,
    "inputAmount" TEXT NOT NULL,
    "outputAmount" TEXT NOT NULL,
    "inputSymbol" TEXT NOT NULL,
    "outputSymbol" TEXT NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SwapDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SwapDraft_cofreAddress_idx" ON "SwapDraft"("cofreAddress");

-- CreateIndex
CREATE UNIQUE INDEX "SwapDraft_cofreAddress_transactionIndex_key" ON "SwapDraft"("cofreAddress", "transactionIndex");
