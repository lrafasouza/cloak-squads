-- Feature: Vault income index
-- Persists incoming SOL transfers per vault PDA so the KPI dashboard reads
-- from a deterministic source instead of re-parsing RPC results on every
-- view. Sync helper upserts on each dashboard load (idempotent via the
-- unique constraint on (cofreAddress, signature)).

CREATE TABLE "VaultIncome" (
    "id"             TEXT NOT NULL,
    "cofreAddress"   TEXT NOT NULL,
    "cluster"        TEXT,
    "vaultIndex"     INTEGER NOT NULL DEFAULT 0,
    "signature"      TEXT NOT NULL,
    "amountLamports" TEXT NOT NULL,
    "fromAddress"    TEXT NOT NULL,
    "blockTime"      TIMESTAMP(3) NOT NULL,
    "toLabel"        TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultIncome_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VaultIncome_cofreAddress_signature_key"
  ON "VaultIncome"("cofreAddress", "signature");

CREATE INDEX "VaultIncome_cofreAddress_idx" ON "VaultIncome"("cofreAddress");
CREATE INDEX "VaultIncome_cofreAddress_blockTime_idx"
  ON "VaultIncome"("cofreAddress", "blockTime");
CREATE INDEX "VaultIncome_cofreAddress_cluster_idx"
  ON "VaultIncome"("cofreAddress", "cluster");

CREATE TABLE "VaultSyncState" (
    "cofreAddress"     TEXT NOT NULL,
    "cluster"          TEXT,
    "lastIncomeSyncAt" TIMESTAMP(3),
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultSyncState_pkey" PRIMARY KEY ("cofreAddress")
);

CREATE INDEX "VaultSyncState_cluster_idx" ON "VaultSyncState"("cluster");
