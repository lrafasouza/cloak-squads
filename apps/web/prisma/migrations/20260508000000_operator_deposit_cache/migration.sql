-- Cross-tab / cross-session backup of the operator's per-proposal Cloak
-- deposit cache. Fast path is sessionStorage; this table is the recovery
-- copy so closing the tab between Deposit and Finalize doesn't trigger a
-- duplicate on-chain deposit on retry.

CREATE TABLE "OperatorDepositCache" (
    "id" TEXT NOT NULL,
    "cofreAddress" TEXT NOT NULL,
    "transactionIndex" TEXT NOT NULL,
    "cluster" TEXT,
    "encryptedPayload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorDepositCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperatorDepositCache_cofreAddress_transactionIndex_key"
    ON "OperatorDepositCache"("cofreAddress", "transactionIndex");

CREATE INDEX "OperatorDepositCache_cofreAddress_idx"
    ON "OperatorDepositCache"("cofreAddress");
