-- Feature: Recurring payments scaffold
-- Stores recurring payment schedule. Execution is manual ("Run now") this sprint;
-- automatic cron is deferred until the sub-vault gatekeeper parametrization lands.

CREATE TABLE "RecurringPayment" (
    "id"           TEXT NOT NULL,
    "cofreAddress" TEXT NOT NULL,
    "vaultIndex"   INTEGER NOT NULL DEFAULT 0,
    "label"        TEXT NOT NULL,
    "recipient"    TEXT NOT NULL,
    "mode"         TEXT NOT NULL DEFAULT 'bound',
    "amount"       TEXT NOT NULL,
    "mint"         TEXT NOT NULL,
    "cadence"      TEXT NOT NULL,
    "nextDueAt"    TIMESTAMP(3) NOT NULL,
    "lastRunAt"    TIMESTAMP(3),
    "privacy"      TEXT NOT NULL DEFAULT 'private',
    "status"       TEXT NOT NULL DEFAULT 'active',
    "createdBy"    TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecurringPayment_cofreAddress_idx" ON "RecurringPayment"("cofreAddress");
CREATE INDEX "RecurringPayment_cofreAddress_status_idx" ON "RecurringPayment"("cofreAddress", "status");
CREATE INDEX "RecurringPayment_nextDueAt_idx" ON "RecurringPayment"("nextDueAt");
