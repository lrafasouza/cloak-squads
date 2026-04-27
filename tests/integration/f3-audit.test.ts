import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type AuditScope,
  type FilteredAuditTransaction,
  deriveScopedAuditKey,
  exportAuditToCSV,
  filterAuditData,
} from "../../packages/core/src/audit";

test("deriveScopedAuditKey is deterministic for same inputs", () => {
  const masterKey = new Uint8Array(32).fill(7);
  const meta = {
    linkId: "link-abc",
    scope: "full" as AuditScope,
    startDate: 1700000000n,
    endDate: 1800000000n,
  };

  const a = deriveScopedAuditKey(masterKey, meta);
  const b = deriveScopedAuditKey(masterKey, meta);

  assert.deepEqual(Buffer.from(a.diversifier), Buffer.from(b.diversifier));
  assert.deepEqual(Buffer.from(a.secretKey), Buffer.from(b.secretKey));
  assert.equal(a.diversifier.length, 32);
  assert.equal(a.secretKey.length, 32);
});

test("deriveScopedAuditKey produces distinct keys per scope", () => {
  const masterKey = new Uint8Array(32).fill(7);
  const baseMeta = {
    linkId: "link-abc",
    startDate: 0n,
    endDate: 0n,
  };

  const full = deriveScopedAuditKey(masterKey, { ...baseMeta, scope: "full" });
  const amounts = deriveScopedAuditKey(masterKey, { ...baseMeta, scope: "amounts_only" });
  const ranged = deriveScopedAuditKey(masterKey, { ...baseMeta, scope: "time_ranged" });

  assert.notDeepEqual(Buffer.from(full.secretKey), Buffer.from(amounts.secretKey));
  assert.notDeepEqual(Buffer.from(full.secretKey), Buffer.from(ranged.secretKey));
  assert.notDeepEqual(Buffer.from(amounts.secretKey), Buffer.from(ranged.secretKey));
});

test("filterAuditData time_ranged drops out-of-range txs", () => {
  const txs: FilteredAuditTransaction[] = [
    { timestamp: 1000, type: "deposit", amount: "100", nullifier: "n1", status: "confirmed" },
    { timestamp: 2000, type: "deposit", amount: "200", nullifier: "n2", status: "confirmed" },
    { timestamp: 3000, type: "deposit", amount: "300", nullifier: "n3", status: "confirmed" },
  ];
  const out = filterAuditData(txs, "time_ranged", { startDate: 1500, endDate: 2500 });
  assert.equal(out.length, 1);
  assert.equal(out[0].nullifier, "n2");
});

test("filterAuditData amounts_only redacts amounts to undefined", () => {
  const txs: FilteredAuditTransaction[] = [
    { timestamp: 1000, type: "deposit", amount: "100", nullifier: "n1", status: "confirmed" },
  ];
  const out = filterAuditData(txs, "amounts_only");
  assert.equal(out.length, 1);
  assert.equal(out[0].amount, undefined);
});

test("filterAuditData full leaves data untouched", () => {
  const txs: FilteredAuditTransaction[] = [
    { timestamp: 1000, type: "deposit", amount: "100", nullifier: "n1", status: "confirmed" },
  ];
  const out = filterAuditData(txs, "full");
  assert.equal(out.length, 1);
  assert.equal(out[0].amount, "100");
});

test("exportAuditToCSV emits header + escaped rows", () => {
  const txs: FilteredAuditTransaction[] = [
    { timestamp: 1700000000000, type: "deposit", amount: "100", nullifier: "n,1", status: "confirmed" },
    { timestamp: 1700000001000, type: 'with"draw', amount: undefined, nullifier: "n2", status: "pending" },
  ];
  const csv = exportAuditToCSV(txs);
  const lines = csv.split("\n").filter(Boolean);

  assert.ok(lines[0].startsWith("timestamp,type,amount,nullifier,status"));
  assert.ok(lines[1].includes('"n,1"'), "comma must be quoted");
  assert.ok(lines[2].includes('"with""draw"'), "quote must be doubled");
  assert.ok(lines[2].includes("REDACTED"), "undefined amount becomes REDACTED");
});

test("filterAuditData time_ranged with no params is a no-op", () => {
  const txs: FilteredAuditTransaction[] = [
    { timestamp: 1, type: "deposit", amount: "1", nullifier: "n", status: "confirmed" },
  ];
  const out = filterAuditData(txs, "time_ranged");
  assert.equal(out.length, 1);
});
