-- CreateTable
CREATE TABLE "AddressBookEntry" (
    "id" TEXT NOT NULL,
    "ownerPubkey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddressBookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AddressBookEntry_ownerPubkey_idx" ON "AddressBookEntry"("ownerPubkey");

-- CreateIndex
CREATE UNIQUE INDEX "AddressBookEntry_ownerPubkey_address_key" ON "AddressBookEntry"("ownerPubkey", "address");
