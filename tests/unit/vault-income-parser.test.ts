/**
 * Guards `parseIncome` against the regression that started this whole bug:
 * sub-vault → sub-vault Squads transfers were being indexed with
 * `fromAddress = "Unknown"` because the System.transfer lives inside
 * `tx.meta.innerInstructions` (a CPI from `Squads.vaultTransactionExecute`),
 * which the legacy parser didn't walk. After the fix the source PDA must be
 * recovered, so `useTreasuryFlow` can drop the row via `internalAddresses`.
 */

import type { ParsedTransactionWithMeta } from "@solana/web3.js";
import { describe, expect, test } from "vitest";
import { parseIncome } from "../../apps/web/lib/vault-income-parser";

const VAULT_DEST = "DestSubVaultPdaBase58_______________________";
const VAULT_SOURCE = "SourcePrimaryVaultPda_______________________";
const EXTERNAL_WALLET = "ExternalWalletBase58________________________";
const SIG = "x".repeat(64);

/**
 * Builds a minimal ParsedTransactionWithMeta shaped enough for `parseIncome`.
 * The function only inspects `transaction.message.accountKeys`,
 * `transaction.message.instructions`, `meta.preBalances`,
 * `meta.postBalances`, `meta.err`, and `meta.innerInstructions` — everything
 * else can be left undefined.
 */
function buildTx(opts: {
  preBalance: number;
  postBalance: number;
  topLevelInstructions: unknown[];
  innerInstructions?: unknown[];
}): ParsedTransactionWithMeta {
  const accountKeys = [
    { pubkey: { toBase58: () => VAULT_DEST } },
    { pubkey: { toBase58: () => VAULT_SOURCE } },
  ];
  const inner =
    opts.innerInstructions !== undefined
      ? [{ index: 0, instructions: opts.innerInstructions }]
      : [];
  return {
    transaction: {
      message: {
        accountKeys,
        instructions: opts.topLevelInstructions,
      },
    },
    meta: {
      err: null,
      preBalances: [opts.preBalance, 0],
      postBalances: [opts.postBalance, 0],
      innerInstructions: inner,
    },
  } as unknown as ParsedTransactionWithMeta;
}

const sigInfo = { signature: SIG, blockTime: 1_700_000_000 };

describe("parseIncome — top-level transfers", () => {
  test("resolves source for an external wallet → vault deposit", () => {
    const tx = buildTx({
      preBalance: 1_000_000_000,
      postBalance: 1_500_000_000,
      topLevelInstructions: [
        {
          parsed: {
            type: "transfer",
            info: { source: EXTERNAL_WALLET, destination: VAULT_DEST, lamports: 500_000_000 },
          },
          program: "system",
        },
      ],
    });
    const out = parseIncome(tx, sigInfo, VAULT_DEST, 0, null);
    expect(out).not.toBeNull();
    expect(out?.fromAddress).toBe(EXTERNAL_WALLET);
    expect(out?.amountLamports).toBe(500_000_000n);
  });
});

describe("parseIncome — inner-instruction (CPI) transfers", () => {
  test("recovers source from a Squads vault-tx CPI System.transfer", () => {
    const tx = buildTx({
      preBalance: 1_000_000_000,
      postBalance: 1_200_000_000,
      // Top-level instruction is the Squads program — NOT a parsed
      // System.transfer. The legacy parser fell off here and left from="Unknown".
      topLevelInstructions: [
        // Pretend this is the Squads vaultTransactionExecute (no `parsed` shape).
        { programId: { toBase58: () => "SquadsProgramId" } },
      ],
      innerInstructions: [
        {
          parsed: {
            type: "transfer",
            info: { source: VAULT_SOURCE, destination: VAULT_DEST, lamports: 200_000_000 },
          },
          program: "system",
        },
      ],
    });
    const out = parseIncome(tx, sigInfo, VAULT_DEST, 1, "Payroll");
    expect(out).not.toBeNull();
    expect(out?.fromAddress).toBe(VAULT_SOURCE);
    expect(out?.amountLamports).toBe(200_000_000n);
    expect(out?.toLabel).toBe("Payroll");
    expect(out?.vaultIndex).toBe(1);
  });

  test("ignores inner transfers whose destination isn't our vault", () => {
    const tx = buildTx({
      preBalance: 1_000_000_000,
      postBalance: 1_200_000_000,
      topLevelInstructions: [{ programId: { toBase58: () => "SquadsProgramId" } }],
      innerInstructions: [
        {
          parsed: {
            type: "transfer",
            info: {
              source: VAULT_SOURCE,
              destination: "SomeOtherAccount___________________________",
              lamports: 200_000_000,
            },
          },
          program: "system",
        },
      ],
    });
    const out = parseIncome(tx, sigInfo, VAULT_DEST, 1, null);
    // Diff is positive (200M lamports went into our vault somehow), parser
    // gracefully falls back to from="Unknown" with the diff as the amount.
    expect(out).not.toBeNull();
    expect(out?.fromAddress).toBe("Unknown");
    expect(out?.amountLamports).toBe(200_000_000n);
  });

  test("rejects when balance diff is below the dust threshold", () => {
    const tx = buildTx({
      preBalance: 1_000_000_000,
      postBalance: 1_000_000_000 + 50_000, // 50k lamports < 100k guard
      topLevelInstructions: [],
    });
    const out = parseIncome(tx, sigInfo, VAULT_DEST, 0, null);
    expect(out).toBeNull();
  });

  test("rejects when the transaction itself failed", () => {
    const tx = buildTx({
      preBalance: 1_000_000_000,
      postBalance: 1_500_000_000,
      topLevelInstructions: [],
    });
    (tx.meta as { err: unknown }).err = { InstructionError: [0, "Custom"] };
    const out = parseIncome(tx, sigInfo, VAULT_DEST, 0, null);
    expect(out).toBeNull();
  });
});
