-- Add signPubkey field to StealthInvoice for challenge-response claim auth
ALTER TABLE "StealthInvoice" ADD COLUMN "signPubkey" TEXT;
