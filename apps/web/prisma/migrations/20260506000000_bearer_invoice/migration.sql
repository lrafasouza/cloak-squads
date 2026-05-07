-- Feature: Bearer Invoice mode
-- StealthInvoice can now be created without a recipient wallet (bearer mode).
-- Existing rows are bound (recipient locked at create); new rows can be bearer
-- (recipient picks destination wallet at claim time).

ALTER TABLE "StealthInvoice" ALTER COLUMN "recipientWallet" DROP NOT NULL;
ALTER TABLE "StealthInvoice" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'bound';
