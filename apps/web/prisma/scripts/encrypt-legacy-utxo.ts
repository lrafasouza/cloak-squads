/**
 * Back-fill script: encrypt legacy StealthInvoice UTXO fields.
 *
 * Run after prisma migrate deploy when ENCRYPTION was first enabled:
 *   npx tsx apps/web/prisma/scripts/encrypt-legacy-utxo.ts
 *
 * Safe to run multiple times — only touches rows whose fields do NOT
 * already have the "v1." prefix. Prints a dry-run summary first.
 *
 * Required env: DATABASE_URL, JWT_SIGNING_SECRET
 */

import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes, createCipheriv } from "crypto";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dotenv = require("dotenv") as { config: (opts: { path: string }) => void };
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const prisma = new PrismaClient();
const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const V1_PREFIX = "v1.";

function getKey(): Buffer {
  const secret = process.env.JWT_SIGNING_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SIGNING_SECRET must be at least 16 chars");
  }
  return createHash("sha256").update(secret).digest();
}

function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return V1_PREFIX + Buffer.concat([iv, encrypted, authTag]).toString("base64");
}

function needsEncryption(value: string | null): boolean {
  if (!value) return false;
  return !value.startsWith(V1_PREFIX);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`Running in ${dryRun ? "DRY-RUN" : "LIVE"} mode`);

  const rows = await prisma.stealthInvoice.findMany({
    select: {
      id: true,
      utxoPrivateKey: true,
      utxoBlinding: true,
    },
  });

  let toUpdate = 0;
  let updated = 0;
  let errors = 0;

  for (const row of rows) {
    const needsUpdate =
      needsEncryption(row.utxoPrivateKey) || needsEncryption(row.utxoBlinding);

    if (!needsUpdate) continue;
    toUpdate++;

    if (dryRun) {
      console.log(`[dry-run] Would encrypt invoice ${row.id}`);
      continue;
    }

    try {
      const data: { utxoPrivateKey?: string; utxoBlinding?: string } = {};
      if (needsEncryption(row.utxoPrivateKey)) data.utxoPrivateKey = encryptField(row.utxoPrivateKey!);
      if (needsEncryption(row.utxoBlinding)) data.utxoBlinding = encryptField(row.utxoBlinding!);
      await prisma.stealthInvoice.update({
        where: { id: row.id },
        data,
      });
      console.log(`Encrypted invoice ${row.id}`);
      updated++;
    } catch (err) {
      console.error(`Failed to encrypt invoice ${row.id}:`, err);
      errors++;
    }
  }

  console.log(`\nTotal rows: ${rows.length}`);
  console.log(`Needing update: ${toUpdate}`);
  if (!dryRun) {
    console.log(`Updated: ${updated}`);
    console.log(`Errors: ${errors}`);
  }

  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
