-- Scope vault-related rows by Solana cluster (devnet/mainnet-beta/testnet/localnet).
-- Without this, a draft created on devnet can leak into a mainnet UI when the
-- DB is shared, surfacing as a queue item with proposalStatus = "unknown"
-- because the matching on-chain proposal lives on a different chain.
--
-- Field is nullable for safe rollout. Read paths filter strictly by cluster,
-- so legacy NULL rows disappear from lists until backfilled. To restore them,
-- run something like:
--   UPDATE "ProposalDraft" SET "cluster" = 'devnet' WHERE "cluster" IS NULL;
-- in each environment (substitute the env's NEXT_PUBLIC_SOLANA_CLUSTER value).

ALTER TABLE "ProposalDraft"   ADD COLUMN "cluster" TEXT;
ALTER TABLE "PayrollDraft"    ADD COLUMN "cluster" TEXT;
ALTER TABLE "SwapDraft"       ADD COLUMN "cluster" TEXT;
ALTER TABLE "StealthInvoice"  ADD COLUMN "cluster" TEXT;
ALTER TABLE "RecurringPayment" ADD COLUMN "cluster" TEXT;
ALTER TABLE "SpendingLimit"   ADD COLUMN "cluster" TEXT;
ALTER TABLE "Vault"           ADD COLUMN "cluster" TEXT;
ALTER TABLE "SubVault"        ADD COLUMN "cluster" TEXT;
ALTER TABLE "AuditLink"       ADD COLUMN "cluster" TEXT;

CREATE INDEX "ProposalDraft_cofreAddress_cluster_idx"   ON "ProposalDraft"("cofreAddress", "cluster");
CREATE INDEX "PayrollDraft_cofreAddress_cluster_idx"    ON "PayrollDraft"("cofreAddress", "cluster");
CREATE INDEX "SwapDraft_cofreAddress_cluster_idx"       ON "SwapDraft"("cofreAddress", "cluster");
CREATE INDEX "StealthInvoice_cofreAddress_cluster_idx"  ON "StealthInvoice"("cofreAddress", "cluster");
CREATE INDEX "RecurringPayment_cofreAddress_cluster_idx" ON "RecurringPayment"("cofreAddress", "cluster");
CREATE INDEX "SpendingLimit_cofreAddress_cluster_idx"   ON "SpendingLimit"("cofreAddress", "cluster");
CREATE INDEX "Vault_cluster_idx"                        ON "Vault"("cluster");
CREATE INDEX "SubVault_cofreAddress_cluster_idx"        ON "SubVault"("cofreAddress", "cluster");
CREATE INDEX "AuditLink_cofreAddress_cluster_idx"       ON "AuditLink"("cofreAddress", "cluster");
