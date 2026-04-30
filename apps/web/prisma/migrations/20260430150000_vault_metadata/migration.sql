CREATE TABLE "Vault" (
    "id" TEXT NOT NULL,
    "cofreAddress" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vault_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Vault_cofreAddress_key" ON "Vault"("cofreAddress");
CREATE INDEX "Vault_cofreAddress_idx" ON "Vault"("cofreAddress");
