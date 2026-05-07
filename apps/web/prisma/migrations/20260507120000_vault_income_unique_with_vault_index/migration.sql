-- Bug fix: a single Solana tx can deposit into multiple vault PDAs (primary +
-- sub-vault). The original (cofreAddress, signature) unique key collapsed
-- those into one row, dropping one of the deposits. Replacing with a
-- (cofreAddress, signature, vaultIndex) unique so each vault PDA's view of
-- the same signature is preserved independently.

DROP INDEX IF EXISTS "VaultIncome_cofreAddress_signature_key";

CREATE UNIQUE INDEX "VaultIncome_cofreAddress_signature_vaultIndex_key"
  ON "VaultIncome"("cofreAddress", "signature", "vaultIndex");
