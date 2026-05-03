CREATE TABLE "VaultSettings" (
    "id" TEXT NOT NULL,
    "cofreAddress" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "rpcOverride" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VaultSettings_cofreAddress_key" ON "VaultSettings"("cofreAddress");
CREATE INDEX "VaultSettings_cofreAddress_idx" ON "VaultSettings"("cofreAddress");

ALTER TABLE "VaultSettings" ADD CONSTRAINT "VaultSettings_cofreAddress_fkey" FOREIGN KEY ("cofreAddress") REFERENCES "Vault"("cofreAddress") ON DELETE CASCADE ON UPDATE CASCADE;
