-- Rename misleadingly-named column: the field stores plaintext, not ciphertext
ALTER TABLE "StealthInvoice" RENAME COLUMN "amountHintEncrypted" TO "amountHint";
