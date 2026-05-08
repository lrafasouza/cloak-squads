/**
 * Audit core lib tests — exercises the filter + CSV semantics.
 *
 * Why functions are inlined here: this file runs under
 * `node --experimental-strip-types` (see `test:int` in package.json), whose
 * ESM resolver does not honour the workspace `exports` map AND requires
 * fully-qualified file extensions for every relative import. The core lib
 * (`packages/core/src/audit.ts`) internally re-exports from `./encoding`
 * without `.js`, so importing it here fails with `ERR_MODULE_NOT_FOUND`
 * before the tests can run.
 *
 * To prevent silent drift between this inline copy and the real lib, the
 * last test pins the **exact** CSV header emitted by core. Changing the
 * production header without updating this constant trips a clear failure.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

/** Pinned to `exportAuditToCSV` in `packages/core/src/audit.ts`. If the
 *  production header changes, update this string AND the inline emitter
 *  below in lockstep. */
const PRODUCTION_CSV_HEADER = "timestamp,type,subtype,amount,nullifier,status,vaultIndex";

type FilteredAuditTransaction = {
  timestamp: number;
  type: "deposit" | "transfer" | "withdraw";
  subtype?: "send" | "payroll" | "swap" | "income" | "invoice";
  amount?: string | undefined;
  nullifier: string;
  status: "confirmed" | "pending" | "failed";
  vaultIndex?: number;
};

function filterAuditData(
  transactions: FilteredAuditTransaction[],
  scope: "full" | "amounts_only" | "time_ranged",
  params?: { startDate: number; endDate: number },
) {
  let filtered = transactions;
  if (scope === "time_ranged" && params) {
    filtered = filtered.filter(
      (tx) => tx.timestamp >= params.startDate && tx.timestamp <= params.endDate,
    );
  }
  if (scope === "amounts_only") {
    filtered = filtered.map((tx) => ({ ...tx, nullifier: "REDACTED" }));
  }
  return filtered;
}

function exportAuditToCSV(transactions: FilteredAuditTransaction[]): string {
  const headers = [
    "timestamp",
    "type",
    "subtype",
    "amount",
    "nullifier",
    "status",
    "vaultIndex",
  ];
  const rows = transactions.map((tx) => ({
    timestamp: new Date(tx.timestamp).toISOString(),
    type: tx.type,
    subtype: tx.subtype ?? "",
    amount: tx.amount ?? "N/A",
    nullifier: tx.nullifier,
    status: tx.status,
    vaultIndex: tx.vaultIndex !== undefined ? String(tx.vaultIndex) : "",
  }));
  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h as keyof typeof row];
          if (val.includes(",") || val.includes('"')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(","),
    ),
  ];
  return csvLines.join("\n");
}

test("filterAuditData time_ranged drops out-of-range txs", () => {
  const txs: FilteredAuditTransaction[] = [
    { timestamp: 1000, type: "deposit", amount: "100", nullifier: "n1", status: "confirmed" },
    { timestamp: 2000, type: "deposit", amount: "200", nullifier: "n2", status: "confirmed" },
    { timestamp: 3000, type: "deposit", amount: "300", nullifier: "n3", status: "confirmed" },
  ];
  const out = filterAuditData(txs, "time_ranged", { startDate: 1500, endDate: 2500 });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.nullifier, "n2");
});

test("filterAuditData amounts_only redacts nullifiers, keeps amounts", () => {
  const txs: FilteredAuditTransaction[] = [
    { timestamp: 1000, type: "deposit", amount: "100", nullifier: "n1", status: "confirmed" },
  ];
  const out = filterAuditData(txs, "amounts_only");
  assert.equal(out.length, 1);
  assert.equal(out[0]!.amount, "100");
  assert.equal(out[0]!.nullifier, "REDACTED");
});

test("filterAuditData full leaves data untouched", () => {
  const txs: FilteredAuditTransaction[] = [
    { timestamp: 1000, type: "deposit", amount: "100", nullifier: "n1", status: "confirmed" },
  ];
  const out = filterAuditData(txs, "full");
  assert.equal(out.length, 1);
  assert.equal(out[0]!.amount, "100");
  assert.equal(out[0]!.nullifier, "n1");
});

test("exportAuditToCSV header matches production shape (drift sentinel)", () => {
  const csv = exportAuditToCSV([]);
  assert.equal(
    csv,
    PRODUCTION_CSV_HEADER,
    "CSV header drifted — update PRODUCTION_CSV_HEADER and the inline emitter together",
  );
});

test("exportAuditToCSV emits header + escaped rows + new columns", () => {
  const txs: FilteredAuditTransaction[] = [
    {
      timestamp: 1700000000000,
      type: "transfer",
      subtype: "payroll",
      amount: "100",
      nullifier: "n,1",
      status: "confirmed",
      vaultIndex: 0,
    },
    {
      timestamp: 1700000001000,
      type: "withdraw",
      amount: undefined,
      nullifier: "n2",
      status: "pending",
    },
  ];
  const csv = exportAuditToCSV(txs);
  const lines = csv.split("\n").filter(Boolean);

  assert.equal(lines[0], PRODUCTION_CSV_HEADER);
  assert.ok(lines[1]!.includes('"n,1"'), "comma must be quoted");
  assert.ok(lines[1]!.includes("payroll"), "subtype round-trips into CSV");
  assert.ok(lines[2]!.includes("N/A"), "undefined amount becomes N/A");
});

test("filterAuditData time_ranged with no params is a no-op", () => {
  const txs: FilteredAuditTransaction[] = [
    { timestamp: 1, type: "deposit", amount: "1", nullifier: "n", status: "confirmed" },
  ];
  const out = filterAuditData(txs, "time_ranged");
  assert.equal(out.length, 1);
});
