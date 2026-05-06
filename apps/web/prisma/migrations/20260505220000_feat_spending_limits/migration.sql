-- Feature: Spending limits
-- Stores per-multisig spending limit metadata for UI display.

CREATE TABLE "SpendingLimit" (
    "id"           TEXT NOT NULL,
    "cofreAddress" TEXT NOT NULL,
    "spendingLimit" TEXT NOT NULL,
    "createKey"    TEXT NOT NULL,
    "vaultIndex"   INTEGER NOT NULL,
    "mint"         TEXT NOT NULL,
    "amountRaw"    TEXT NOT NULL,
    "period"       TEXT NOT NULL,
    "members"      TEXT[] NOT NULL,
    "destinations" TEXT[] NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'active',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpendingLimit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SpendingLimit_cofreAddress_idx" ON "SpendingLimit"("cofreAddress");
CREATE INDEX "SpendingLimit_cofreAddress_status_idx" ON "SpendingLimit"("cofreAddress", "status");
