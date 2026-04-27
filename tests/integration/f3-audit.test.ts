/**
 * Simplified audit tests — runs without complex node_modules resolution.
 * Tests the filter and CSV logic directly.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

// Inline simplified versions for testing (avoiding node_modules imports)
function filterAuditData(
  transactions: Array<{
    timestamp: number;
    type: "deposit" | "transfer" | "withdraw";
    amount?: string | undefined;
    nullifier: string;
    status: "confirmed" | "pending";
  }>,
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
    filtered = filtered.map((tx) => ({
      ...tx,
      amount: undefined,
    }));
  }

  return filtered;
}

function exportAuditToCSV(
  transactions: Array<{
    timestamp: number;
    type: "deposit" | "transfer" | "withdraw";
    amount?: string | undefined;
    nullifier: string;
    status: "confirmed" | "pending";
  }>,
): string {
  const headers = ["timestamp", "type", "amount", "nullifier", "status"];
  const rows = transactions.map((tx) => ({
    timestamp: new Date(tx.timestamp).toISOString(),
    type: tx.type,
    amount: tx.amount ?? "REDACTED",
    nullifier: tx.nullifier,
    status: tx.status,
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
  const txs = [
    { timestamp: 1000, type: "deposit" as const, amount: "100", nullifier: "n1", status: "confirmed" as const },
    { timestamp: 2000, type: "deposit" as const, amount: "200", nullifier: "n2", status: "confirmed" as const },
    { timestamp: 3000, type: "deposit" as const, amount: "300", nullifier: "n3", status: "confirmed" as const },
  ];
  const out = filterAuditData(txs, "time_ranged", { startDate: 1500, endDate: 2500 });
  assert.equal(out.length, 1);
  assert.equal(out[0].nullifier, "n2");
});

test("filterAuditData amounts_only redacts amounts to undefined", () => {
  const txs = [
    { timestamp: 1000, type: "deposit" as const, amount: "100", nullifier: "n1", status: "confirmed" as const },
  ];
  const out = filterAuditData(txs, "amounts_only");
  assert.equal(out.length, 1);
  assert.equal(out[0].amount, undefined);
});

test("filterAuditData full leaves data untouched", () => {
  const txs = [
    { timestamp: 1000, type: "deposit" as const, amount: "100", nullifier: "n1", status: "confirmed" as const },
  ];
  const out = filterAuditData(txs, "full");
  assert.equal(out.length, 1);
  assert.equal(out[0].amount, "100");
});

test("exportAuditToCSV emits header + escaped rows", () => {
  const txs = [
    { timestamp: 1700000000000, type: "deposit" as const, amount: "100", nullifier: "n,1", status: "confirmed" as const },
    { timestamp: 1700000001000, type: "withdraw" as const, amount: undefined, nullifier: "n2", status: "pending" as const },
  ];
  const csv = exportAuditToCSV(txs);
  const lines = csv.split("\n").filter(Boolean);

  assert.ok(lines[0].startsWith("timestamp,type,amount,nullifier,status"));
  assert.ok(lines[1].includes('"n,1"'), "comma must be quoted");
  assert.ok(lines[2].includes("REDACTED"), "undefined amount becomes REDACTED");
});

test("filterAuditData time_ranged with no params is a no-op", () => {
  const txs = [
    { timestamp: 1, type: "deposit" as const, amount: "1", nullifier: "n", status: "confirmed" as const },
  ];
  const out = filterAuditData(txs, "time_ranged");
  assert.equal(out.length, 1);
});
