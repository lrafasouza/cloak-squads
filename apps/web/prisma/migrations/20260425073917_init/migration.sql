-- CreateTable
CREATE TABLE "AuditLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cofreAddress" TEXT NOT NULL,
    "diversifier" BLOB NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeParams" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "signature" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StealthInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cofreAddress" TEXT NOT NULL,
    "invoiceRef" TEXT,
    "memo" TEXT,
    "stealthPubkey" TEXT NOT NULL,
    "amountHintEncrypted" BLOB,
    "status" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AuditLink_cofreAddress_idx" ON "AuditLink"("cofreAddress");

-- CreateIndex
CREATE INDEX "StealthInvoice_cofreAddress_idx" ON "StealthInvoice"("cofreAddress");

-- CreateIndex
CREATE INDEX "StealthInvoice_stealthPubkey_idx" ON "StealthInvoice"("stealthPubkey");
