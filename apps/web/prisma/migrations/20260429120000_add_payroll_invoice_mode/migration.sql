-- Add payroll delivery mode and optional stealth invoice linkage per recipient.
ALTER TABLE "PayrollDraft" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE "PayrollRecipient" ADD COLUMN "invoiceId" TEXT;
