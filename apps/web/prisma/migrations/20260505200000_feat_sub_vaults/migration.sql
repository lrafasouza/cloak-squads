-- Feature: Sub-vaults (vault_index parametrization)
-- Adds SubVault metadata table and vaultIndex column to all draft models.

-- SubVault: per-multisig named vault metadata (vault PDA exists without tx)
CREATE TABLE "SubVault" (
    "id"           TEXT NOT NULL,
    "cofreAddress" TEXT NOT NULL,
    "vaultIndex"   INTEGER NOT NULL,
    "name"         TEXT NOT NULL,
    "color"        TEXT,
    "icon"         TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubVault_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubVault_cofreAddress_vaultIndex_key" ON "SubVault"("cofreAddress", "vaultIndex");
CREATE INDEX "SubVault_cofreAddress_idx" ON "SubVault"("cofreAddress");

-- vaultIndex on all draft models (default 0 = main vault, backward-compatible)
ALTER TABLE "ProposalDraft" ADD COLUMN "vaultIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PayrollDraft"  ADD COLUMN "vaultIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StealthInvoice" ADD COLUMN "vaultIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SwapDraft"     ADD COLUMN "vaultIndex" INTEGER NOT NULL DEFAULT 0;
