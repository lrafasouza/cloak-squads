/**
 * Re-encrypt every `v1.` field-crypto row under the current FIELD_CRYPTO_KEY.
 *
 * Run during a key rotation, after both `FIELD_CRYPTO_KEY` (new) and
 * `FIELD_CRYPTO_KEY_PREVIOUS` (old) are set in the env. The lib's
 * `decryptField` already accepts both during the dual-read window; this
 * script back-fills rows so the operator can drop `FIELD_CRYPTO_KEY_PREVIOUS`
 * once it reports zero rows under the old key.
 *
 *   pnpm tsx apps/web/prisma/scripts/rotate-field-crypto.ts --dry-run
 *   pnpm tsx apps/web/prisma/scripts/rotate-field-crypto.ts
 *
 * Idempotent: re-encrypting a row already under the current key is a no-op
 * round-trip (decrypt + encrypt yields a different IV but same plaintext).
 * Safe to re-run after a partial failure.
 *
 * Required env: DATABASE_URL, FIELD_CRYPTO_KEY (current), FIELD_CRYPTO_KEY_PREVIOUS.
 *
 * Tables touched (every column that holds a `v1.`-prefixed string):
 *   - StealthInvoice.utxoPrivateKey, utxoBlinding
 *   - OperatorDepositCache.encryptedPayload
 *
 * Memos use ECIES (server cannot read), so they're not in scope here.
 */

import { PrismaClient } from "@prisma/client";

// `.ts` extension on the relative import is required for the ESM resolver
// when this script is executed via `pnpm tsx` (the documented runner).
// Without it Node throws ERR_MODULE_NOT_FOUND before reaching any of the
// rotation logic — the script has to actually run to migrate rows.
import { decryptField, encryptField } from "../../lib/field-crypto.ts";

// No dotenv loader: pass env vars explicitly when invoking the script.
// Local dev:
//   DATABASE_URL=... FIELD_CRYPTO_KEY=... FIELD_CRYPTO_KEY_PREVIOUS=... \
//     pnpm tsx apps/web/prisma/scripts/rotate-field-crypto.ts --dry-run
// Production (Render): envs are already injected via render.yaml +
// the dashboard, so the script picks them up natively.

const prisma = new PrismaClient();
const V1_PREFIX = "v1.";

type RowSummary = {
  table: string;
  id: string;
  fields: string[];
};

function isCiphertext(value: string | null | undefined): value is string {
  return !!value && value.startsWith(V1_PREFIX);
}

async function rotateStealthInvoices(dryRun: boolean): Promise<RowSummary[]> {
  const rows = await prisma.stealthInvoice.findMany({
    select: { id: true, utxoPrivateKey: true, utxoBlinding: true },
  });
  const updated: RowSummary[] = [];

  for (const row of rows) {
    const fields: string[] = [];
    const data: { utxoPrivateKey?: string; utxoBlinding?: string } = {};

    if (isCiphertext(row.utxoPrivateKey)) {
      const plain = decryptField(row.utxoPrivateKey);
      data.utxoPrivateKey = encryptField(plain);
      fields.push("utxoPrivateKey");
    }
    if (isCiphertext(row.utxoBlinding)) {
      const plain = decryptField(row.utxoBlinding);
      data.utxoBlinding = encryptField(plain);
      fields.push("utxoBlinding");
    }

    if (fields.length === 0) continue;
    updated.push({ table: "StealthInvoice", id: row.id, fields });

    if (!dryRun) {
      await prisma.stealthInvoice.update({ where: { id: row.id }, data });
    }
  }
  return updated;
}

async function rotateOperatorDepositCache(dryRun: boolean): Promise<RowSummary[]> {
  const rows = await prisma.operatorDepositCache.findMany({
    select: { id: true, encryptedPayload: true },
  });
  const updated: RowSummary[] = [];

  for (const row of rows) {
    if (!isCiphertext(row.encryptedPayload)) continue;
    const plain = decryptField(row.encryptedPayload);
    const reencrypted = encryptField(plain);
    updated.push({ table: "OperatorDepositCache", id: row.id, fields: ["encryptedPayload"] });
    if (!dryRun) {
      await prisma.operatorDepositCache.update({
        where: { id: row.id },
        data: { encryptedPayload: reencrypted },
      });
    }
  }
  return updated;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[rotate-field-crypto] mode=${dryRun ? "DRY-RUN" : "LIVE"}`);

  // Surface a clear error if the operator forgot to set the previous key.
  // Without it the dual-read fallback in field-crypto can't help — every row
  // encrypted under the old key would throw on decrypt and crash the script
  // halfway through.
  if (!process.env.FIELD_CRYPTO_KEY_PREVIOUS) {
    console.warn(
      "[rotate-field-crypto] WARNING: FIELD_CRYPTO_KEY_PREVIOUS is not set. " +
        "Rows already under the current key will rotate fine, but rows under an " +
        "older key will throw. Set FIELD_CRYPTO_KEY_PREVIOUS = old key value " +
        "before continuing if any rotation is in progress.",
    );
  }

  let total = 0;
  let errors = 0;

  for (const fn of [rotateStealthInvoices, rotateOperatorDepositCache]) {
    try {
      const updates = await fn(dryRun);
      total += updates.length;
      for (const u of updates) {
        console.log(`  ${dryRun ? "[would]" : "[did]"} ${u.table}/${u.id} → ${u.fields.join(",")}`);
      }
    } catch (err) {
      errors++;
      console.error(`[rotate-field-crypto] ${fn.name} failed:`, err);
    }
  }

  console.log(`\n[rotate-field-crypto] ${dryRun ? "would update" : "updated"}: ${total} rows`);
  if (errors > 0) {
    console.error(`[rotate-field-crypto] ${errors} table(s) errored — re-run after fixing.`);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("[rotate-field-crypto] fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
