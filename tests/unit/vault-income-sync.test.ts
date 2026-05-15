/**
 * Unit tests for `apps/web/lib/vault-income-sync.ts`.
 *
 * The module is heavyweight (541 LOC, Prisma + RPC + WebSocket pathways),
 * but the three highest-leverage behaviours don't need a live RPC mock:
 *
 *   1. Throttle race-protection — the SQL upsert returns 0 when another
 *      request already claimed the slot inside the 30s window, and the
 *      function must early-return `{synced:0, throttled:true}` without
 *      ever opening a Connection. A regression here would let every
 *      dashboard read fan out to the RPC.
 *   2. Cluster scoping — `readVaultIncome` must filter by the current
 *      cluster, so devnet income never bleeds into a mainnet UI sharing
 *      the same database.
 *   3. Early-exit guards — when the multisig string isn't a valid pubkey,
 *      the function must exit before any side effect.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Env must be set BEFORE `vault-income-sync.ts` is imported because that
// module reads `process.env.*` into a top-level `const RPC_URL`. ES imports
// are hoisted above plain statements, so plain assignments at the top of
// this file would run AFTER the import. `vi.hoisted` is the escape hatch:
// it runs before vitest evaluates any import in this file.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_RPC_URL = "http://test-rpc.local";
  process.env.NEXT_PUBLIC_SQUADS_PROGRAM_ID = "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";
});

const mocks = vi.hoisted(() => {
  return {
    prisma: {
      vaultSyncState: { upsert: vi.fn() },
      subVault: { findMany: vi.fn() },
      vaultIncome: {
        findMany: vi.fn(),
        upsert: vi.fn(),
      },
      $executeRaw: vi.fn(),
    },
    cluster: vi.fn(() => "devnet"),
    getSignaturesForAddress: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
  isPrismaAvailable: () => true,
}));

vi.mock("@/lib/cluster", () => ({
  getCurrentCluster: () => mocks.cluster(),
}));

vi.mock("@solana/web3.js", async () => {
  const actual = await vi.importActual<typeof import("@solana/web3.js")>("@solana/web3.js");
  return {
    ...actual,
    Connection: vi.fn().mockImplementation(() => ({
      getSignaturesForAddress: (...args: unknown[]) => mocks.getSignaturesForAddress(...args),
    })),
  };
});

import { readVaultIncome, syncVaultIncome } from "@/lib/vault-income-sync";

const MULTISIG = "GqGJC9oWUbNFvw95N3RcktBQGyyDsuMmoLgT1NoXzwzS";

beforeEach(() => {
  mocks.cluster.mockReturnValue("devnet");
  mocks.prisma.vaultSyncState.upsert.mockResolvedValue({});
  mocks.prisma.subVault.findMany.mockResolvedValue([]);
  mocks.prisma.vaultIncome.findMany.mockResolvedValue([]);
  mocks.prisma.vaultIncome.upsert.mockResolvedValue({});
  mocks.prisma.$executeRaw.mockResolvedValue(1);
  mocks.getSignaturesForAddress.mockResolvedValue([]);
});

afterEach(() => {
  for (const fn of [
    mocks.prisma.vaultSyncState.upsert,
    mocks.prisma.subVault.findMany,
    mocks.prisma.vaultIncome.findMany,
    mocks.prisma.vaultIncome.upsert,
    mocks.prisma.$executeRaw,
    mocks.getSignaturesForAddress,
    mocks.cluster,
  ]) {
    fn.mockReset();
  }
});

describe("syncVaultIncome — early-exit guards", () => {
  test("returns {synced:0, throttled:false} when the multisig string is not a valid pubkey", async () => {
    const result = await syncVaultIncome("not-a-pubkey");
    expect(result).toEqual({ synced: 0, throttled: false });
    expect(mocks.prisma.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.getSignaturesForAddress).not.toHaveBeenCalled();
  });
});

describe("syncVaultIncome — throttle race-protection", () => {
  test("returns {throttled:true} when the SQL upsert reports 0 rows affected", async () => {
    // Simulate another replica winning the slot inside the throttle window.
    mocks.prisma.$executeRaw.mockResolvedValue(0);

    const result = await syncVaultIncome(MULTISIG);

    expect(result).toEqual({ synced: 0, throttled: true });
    // Critical: the RPC fan-out must NOT fire when throttle bites.
    expect(mocks.getSignaturesForAddress).not.toHaveBeenCalled();
    expect(mocks.prisma.subVault.findMany).not.toHaveBeenCalled();
  });

  test("force=true bypasses the SQL race throttle (uses regular upsert)", async () => {
    await syncVaultIncome(MULTISIG, { force: true });

    expect(mocks.prisma.vaultSyncState.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.$executeRaw).not.toHaveBeenCalled();
  });

  test("non-force path uses the SQL race throttle (executeRaw, not upsert)", async () => {
    await syncVaultIncome(MULTISIG);

    expect(mocks.prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.vaultSyncState.upsert).not.toHaveBeenCalled();
  });

  test("after winning the throttle slot, fan-out queries the primary vault PDA at minimum", async () => {
    mocks.prisma.$executeRaw.mockResolvedValue(1);

    await syncVaultIncome(MULTISIG);

    // Primary vault is always a target; sub-vaults are additional.
    expect(mocks.getSignaturesForAddress).toHaveBeenCalled();
    expect(mocks.prisma.subVault.findMany).toHaveBeenCalledTimes(1);
  });

  test("throttle SQL is parametrized by the current cluster", async () => {
    mocks.cluster.mockReturnValue("mainnet-beta");
    await syncVaultIncome(MULTISIG);

    expect(mocks.prisma.$executeRaw).toHaveBeenCalledTimes(1);
    // executeRaw is invoked as a tagged template; values are passed as
    // additional args. The cluster value should appear somewhere in the args.
    const call = mocks.prisma.$executeRaw.mock.calls[0]!;
    const flat = JSON.stringify(call);
    expect(flat).toContain("mainnet-beta");
  });
});

describe("readVaultIncome — cluster scoping", () => {
  test("scopes the findMany query to the current cluster", async () => {
    mocks.cluster.mockReturnValue("mainnet-beta");
    mocks.prisma.vaultIncome.findMany.mockResolvedValue([]);

    await readVaultIncome(MULTISIG, 50);

    expect(mocks.prisma.vaultIncome.findMany).toHaveBeenCalledTimes(1);
    const args = mocks.prisma.vaultIncome.findMany.mock.calls[0]![0];
    expect(args.where.cofreAddress).toBe(MULTISIG);
    // Cluster filter is OR'd with `cluster: null` (legacy rows). Both must be present.
    expect(args.where.OR).toEqual(
      expect.arrayContaining([{ cluster: "mainnet-beta" }, { cluster: null }]),
    );
  });

  test("honours the `limit` parameter (passed straight to Prisma `take`)", async () => {
    mocks.prisma.vaultIncome.findMany.mockResolvedValue([]);
    await readVaultIncome(MULTISIG, 7);

    const args = mocks.prisma.vaultIncome.findMany.mock.calls[0]![0];
    expect(args.take).toBe(7);
  });

  test("orders by blockTime desc (newest first)", async () => {
    mocks.prisma.vaultIncome.findMany.mockResolvedValue([]);
    await readVaultIncome(MULTISIG, 10);

    const args = mocks.prisma.vaultIncome.findMany.mock.calls[0]![0];
    expect(args.orderBy).toEqual({ blockTime: "desc" });
  });

  test("maps DB rows into the StoredIncome shape (signature, amountLamports, from, blockTime, toLabel)", async () => {
    mocks.prisma.vaultIncome.findMany.mockResolvedValue([
      {
        signature: "sig-1",
        amountLamports: "1500000000",
        fromAddress: "FromPubkey",
        blockTime: new Date("2026-05-15T12:00:00Z"),
        toLabel: "Operations sub-vault",
        cluster: "devnet",
      },
      {
        signature: "sig-2",
        amountLamports: "9223372036854775807", // > Number.MAX_SAFE_INTEGER — stays as string
        fromAddress: "OtherPubkey",
        blockTime: new Date("2026-05-14T12:00:00Z"),
        toLabel: null,
        cluster: "devnet",
      },
    ]);

    const rows = await readVaultIncome(MULTISIG, 10);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: "income",
      signature: "sig-1",
      amountLamports: "1500000000",
      from: "FromPubkey",
      toLabel: "Operations sub-vault",
    });
    expect(typeof rows[0]!.blockTime).toBe("number");
    // Large lamports stay as string — no Number precision loss.
    expect(rows[1]!.amountLamports).toBe("9223372036854775807");
    expect(rows[1]!.toLabel).toBeUndefined();
  });
});
