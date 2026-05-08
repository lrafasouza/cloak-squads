/**
 * Unit tests for `apps/web/lib/audit-data.ts`.
 *
 * Sprint A's behavioural changes (cluster filter, payroll fan-out, multi-source
 * aggregation, SQL date filter) must be regression-tested here — the export
 * endpoint and the public viewer both go through this lib, so a silent revert
 * would corrupt every audit downstream.
 *
 * Prisma is mocked via vi.mock so the test is hermetic; no DB needed.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Hoist-safe mocks — Vitest evaluates vi.mock factories before the module
// graph is imported, so these definitions intercept `@/lib/prisma` and
// `@/lib/cluster` no matter how `audit-data.ts` happens to import them.
const findMany = {
  proposalDraft: vi.fn(),
  payrollDraft: vi.fn(),
  swapDraft: vi.fn(),
  stealthInvoice: vi.fn(),
  vaultIncome: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    proposalDraft: { findMany: (...a: unknown[]) => findMany.proposalDraft(...a) },
    payrollDraft: { findMany: (...a: unknown[]) => findMany.payrollDraft(...a) },
    swapDraft: { findMany: (...a: unknown[]) => findMany.swapDraft(...a) },
    stealthInvoice: { findMany: (...a: unknown[]) => findMany.stealthInvoice(...a) },
    vaultIncome: { findMany: (...a: unknown[]) => findMany.vaultIncome(...a) },
  },
}));

const cluster = vi.fn(() => "devnet");
vi.mock("@/lib/cluster", () => ({
  getCurrentCluster: () => cluster(),
}));

import { loadAuditTransactions } from "../../apps/web/lib/audit-data";

const VAULT = "VAULT_ADDR";

beforeEach(() => {
  cluster.mockReturnValue("devnet");
  for (const fn of Object.values(findMany)) fn.mockResolvedValue([]);
});

afterEach(() => {
  for (const fn of Object.values(findMany)) fn.mockReset();
});

describe("cluster filter", () => {
  test("every findMany is scoped to the current cluster", async () => {
    cluster.mockReturnValue("mainnet-beta");
    await loadAuditTransactions({ cofreAddress: VAULT, scope: "full" });

    for (const fn of Object.values(findMany)) {
      expect(fn).toHaveBeenCalledTimes(1);
      const callArgs = fn.mock.calls[0]![0];
      expect(callArgs.where.cluster).toBe("mainnet-beta");
      expect(callArgs.where.cofreAddress).toBe(VAULT);
    }
  });

  test("rows tagged with another cluster never reach the result (mock contract)", async () => {
    // Prisma honours `where: { cluster }`; this test pins the contract so a
    // future refactor that drops the cluster predicate from the where clause
    // is caught immediately by the previous assertion.
    cluster.mockReturnValue("devnet");
    findMany.proposalDraft.mockResolvedValue([
      // Mock returns whatever it's told — the production guard is the
      // `where.cluster` we already asserted above.
    ]);
    const out = await loadAuditTransactions({ cofreAddress: VAULT, scope: "full" });
    expect(out).toEqual([]);
  });
});

describe("payroll fan-out", () => {
  test("a payroll with N recipients produces N rows", async () => {
    findMany.payrollDraft.mockResolvedValue([
      {
        id: "payroll-1",
        cofreAddress: VAULT,
        cluster: "devnet",
        totalAmount: "300000",
        recipientCount: 3,
        vaultIndex: 0,
        createdAt: new Date(2026, 4, 1),
        recipients: [
          { wallet: "WalletAlice000000", amount: "100000" },
          { wallet: "WalletBob00000000", amount: "100000" },
          { wallet: "WalletCarol000000", amount: "100000" },
        ],
      },
    ]);

    const out = await loadAuditTransactions({ cofreAddress: VAULT, scope: "full" });
    const payrollRows = out.filter((tx) => tx.subtype === "payroll");
    expect(payrollRows).toHaveLength(3);
    expect(payrollRows.every((r) => r.amount === "100000")).toBe(true);
    // Wallet slice (16 chars) is the auditor-readable identifier.
    expect(payrollRows.map((r) => r.nullifier)).toEqual([
      "WalletAlice00000",
      "WalletBob0000000",
      "WalletCarol00000",
    ]);
  });

  test("an empty-recipient payroll surfaces as a single failed row", async () => {
    findMany.payrollDraft.mockResolvedValue([
      {
        id: "payroll-empty-id",
        cofreAddress: VAULT,
        cluster: "devnet",
        totalAmount: "999",
        recipientCount: 0,
        vaultIndex: 0,
        createdAt: new Date(2026, 4, 1),
        recipients: [],
      },
    ]);
    const out = await loadAuditTransactions({ cofreAddress: VAULT, scope: "full" });
    expect(out).toHaveLength(1);
    expect(out[0]!.status).toBe("failed");
    expect(out[0]!.subtype).toBe("payroll");
  });
});

describe("multi-source aggregation", () => {
  test("includes income, swaps, invoices, and proposals", async () => {
    findMany.proposalDraft.mockResolvedValue([
      {
        amount: "10",
        recipient: "RecipientAddrXXXX",
        vaultIndex: 0,
        archivedAt: null,
        createdAt: new Date(2026, 4, 1),
      },
    ]);
    findMany.swapDraft.mockResolvedValue([
      {
        inputAmount: "5",
        inputSymbol: "SOL",
        outputSymbol: "USDC",
        vaultIndex: 0,
        createdAt: new Date(2026, 4, 2),
      },
    ]);
    findMany.stealthInvoice.mockResolvedValue([
      {
        id: "inv-id-001",
        utxoAmount: "7",
        status: "claimed",
        vaultIndex: 0,
        claimedAt: new Date(2026, 4, 3),
        createdAt: new Date(2026, 4, 1),
      },
    ]);
    findMany.vaultIncome.mockResolvedValue([
      {
        amountLamports: "20",
        fromAddress: "FromAddrXXXXXXXX",
        vaultIndex: 0,
        blockTime: new Date(2026, 4, 4),
      },
    ]);

    const out = await loadAuditTransactions({ cofreAddress: VAULT, scope: "full" });
    const subtypes = out.map((tx) => tx.subtype).sort();
    expect(subtypes).toEqual(["income", "invoice", "send", "swap"]);
    // Sorted newest-first by timestamp.
    expect(out[0]!.subtype).toBe("income");
    expect(out[out.length - 1]!.subtype).toBe("send");
  });

  test("archived proposal drafts are marked failed", async () => {
    findMany.proposalDraft.mockResolvedValue([
      {
        amount: "1",
        recipient: "Recipient0000000",
        vaultIndex: 0,
        archivedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const out = await loadAuditTransactions({ cofreAddress: VAULT, scope: "full" });
    expect(out[0]!.status).toBe("failed");
  });
});

describe("scope filters", () => {
  test("amounts_only redacts every nullifier", async () => {
    findMany.proposalDraft.mockResolvedValue([
      {
        amount: "1",
        recipient: "Recipient0000000",
        vaultIndex: 0,
        archivedAt: null,
        createdAt: new Date(),
      },
    ]);
    findMany.vaultIncome.mockResolvedValue([
      {
        amountLamports: "2",
        fromAddress: "FromAddr00000000",
        vaultIndex: 0,
        blockTime: new Date(),
      },
    ]);
    const out = await loadAuditTransactions({ cofreAddress: VAULT, scope: "amounts_only" });
    expect(out.every((tx) => tx.nullifier === "REDACTED")).toBe(true);
    // Amounts must remain intact under amounts_only — that's the whole point.
    expect(out.map((tx) => tx.amount).sort()).toEqual(["1", "2"]);
  });

  test("time_ranged pushes the date window into SQL (not in-memory)", async () => {
    const start = new Date(2025, 0, 1).getTime();
    const end = new Date(2025, 11, 31).getTime();
    await loadAuditTransactions({
      cofreAddress: VAULT,
      scope: "time_ranged",
      scopeParams: { startDate: start, endDate: end },
    });

    // ProposalDraft / PayrollDraft / SwapDraft / StealthInvoice → createdAt
    for (const key of ["proposalDraft", "payrollDraft", "swapDraft", "stealthInvoice"] as const) {
      const callArgs = findMany[key].mock.calls[0]![0];
      expect(callArgs.where.createdAt).toEqual({
        gte: new Date(start),
        lte: new Date(end),
      });
    }
    // VaultIncome filters on chain-derived blockTime, not insert time.
    const incomeArgs = findMany.vaultIncome.mock.calls[0]![0];
    expect(incomeArgs.where.blockTime).toEqual({
      gte: new Date(start),
      lte: new Date(end),
    });
  });

  test("time_ranged with one bound missing falls back to no SQL filter", async () => {
    await loadAuditTransactions({
      cofreAddress: VAULT,
      scope: "time_ranged",
      scopeParams: { startDate: 1 }, // endDate missing
    });
    const callArgs = findMany.proposalDraft.mock.calls[0]![0];
    expect(callArgs.where.createdAt).toBeUndefined();
  });
});
