-- Feature: Encrypted memos (NaCl box)
-- Adds memoCiphertext/memoNonce/memoEphemeralPk to all draft models.
-- memo (plaintext) is kept for backward-compat; null for new private drafts.

ALTER TABLE "ProposalDraft"  ADD COLUMN "memoCiphertext"  BYTEA;
ALTER TABLE "ProposalDraft"  ADD COLUMN "memoNonce"       BYTEA;
ALTER TABLE "ProposalDraft"  ADD COLUMN "memoEphemeralPk" BYTEA;

ALTER TABLE "PayrollDraft"   ADD COLUMN "memoCiphertext"  BYTEA;
ALTER TABLE "PayrollDraft"   ADD COLUMN "memoNonce"       BYTEA;
ALTER TABLE "PayrollDraft"   ADD COLUMN "memoEphemeralPk" BYTEA;

ALTER TABLE "StealthInvoice" ADD COLUMN "memoCiphertext"  BYTEA;
ALTER TABLE "StealthInvoice" ADD COLUMN "memoNonce"       BYTEA;
ALTER TABLE "StealthInvoice" ADD COLUMN "memoEphemeralPk" BYTEA;

ALTER TABLE "SwapDraft"      ADD COLUMN "memoCiphertext"  BYTEA;
ALTER TABLE "SwapDraft"      ADD COLUMN "memoNonce"       BYTEA;
ALTER TABLE "SwapDraft"      ADD COLUMN "memoEphemeralPk" BYTEA;
