"use client";

import type {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { ComputeBudgetProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";

const IS_DEV = process.env.NODE_ENV === "development";

function log(...args: unknown[]) {
  if (IS_DEV) console.log("[tx-optimization]", ...args);
}

// ── Tunables ──────────────────────────────────────────────────────────────

const MIN_PRIORITY_FEE_MICRO_LAMPORTS = 1_000;
const MAX_PRIORITY_FEE_MICRO_LAMPORTS = 500_000;
const DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS = 5_000;
const FEE_PERCENTILE = 0.75;

const CU_SAFETY_MULTIPLIER = 1.15;
const CU_FLOOR_OVERHEAD = 5_000;
const CU_CEILING = 1_400_000;
const CU_SIMULATION_LIMIT = 1_400_000; // upper bound used during simulation only

// ── Priority Fee ──────────────────────────────────────────────────────────

export async function getDynamicPriorityFee(
  connection: Connection,
  writableAccounts?: PublicKey[],
): Promise<number> {
  try {
    const fees = await connection.getRecentPrioritizationFees({
      lockedWritableAccounts: writableAccounts ?? [],
    });

    if (fees.length === 0) {
      return DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS;
    }

    const sorted = fees.map((f) => f.prioritizationFee ?? 0).sort((a, b) => a - b);
    const idx = Math.min(Math.floor(sorted.length * FEE_PERCENTILE), sorted.length - 1);
    const fee = sorted[idx] ?? DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS;

    return Math.max(
      MIN_PRIORITY_FEE_MICRO_LAMPORTS,
      Math.min(fee, MAX_PRIORITY_FEE_MICRO_LAMPORTS),
    );
  } catch (err) {
    log("getRecentPrioritizationFees failed, using default:", err);
    return DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS;
  }
}

// ── Combined: simulate (with CU limit injected) + build budget ixs ────────

export type OptimizationResult = {
  /** ComputeBudget instructions to prepend to the real transaction. */
  budgetIxs: TransactionInstruction[];
  /** Simulation error, if any. Caller decides whether to throw. */
  simulationErr: unknown | null;
  /** Simulation logs, useful for surfacing on-chain errors. */
  logs: string[];
  /** Compute units consumed during simulation (0 if simulation failed). */
  unitsConsumed: number;
  /** Priority fee applied (microLamports per CU). */
  priorityFee: number;
  /** Compute unit limit applied. */
  computeUnitLimit: number;
};

/**
 * Simulates a transaction with `setComputeUnitLimit(1.4M)` already injected so the
 * runtime allocates a realistic budget, reads `unitsConsumed`, and produces the
 * compute-budget instructions to prepend to the real transaction.
 *
 * On simulation failure, falls back to the CU ceiling — caller can inspect
 * `simulationErr` to decide whether to abort.
 */
export async function simulateAndOptimize(params: {
  connection: Connection;
  instructions: TransactionInstruction[];
  payer: PublicKey;
  writableAccounts?: PublicKey[];
  lookupTableAccounts?: AddressLookupTableAccount[];
}): Promise<OptimizationResult> {
  const { connection, instructions, payer, writableAccounts, lookupTableAccounts } = params;

  // Run priority fee fetch in parallel with the simulation — they are independent.
  const priorityFeePromise = getDynamicPriorityFee(connection, writableAccounts);

  let unitsConsumed = 0;
  let simulationErr: unknown | null = null;
  let logs: string[] = [];

  try {
    const latestBlockhash = await connection.getLatestBlockhash();

    // Inject a high CU limit during simulation so the runtime doesn't truncate
    // execution at the default per-ix budget. Inject a 0 priority fee — it does
    // not affect unitsConsumed and avoids paying a real fee during sim.
    const simInstructions: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: CU_SIMULATION_LIMIT }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }),
      ...instructions,
    ];

    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: simInstructions,
    }).compileToV0Message(lookupTableAccounts ?? []);
    const vtx = new VersionedTransaction(message);

    const sim = await connection.simulateTransaction(vtx, {
      replaceRecentBlockhash: true,
      sigVerify: false,
    });

    logs = sim.value.logs ?? [];
    if (sim.value.err) {
      simulationErr = sim.value.err;
    } else {
      unitsConsumed = sim.value.unitsConsumed ?? 0;
    }
  } catch (err) {
    log("simulation threw, falling back to CU ceiling:", err);
    simulationErr = err;
  }

  const priorityFee = await priorityFeePromise;

  // If simulation failed or returned 0, fall back to the ceiling so the TX still has
  // budget. The caller can use `simulationErr` to abort if desired.
  const computeUnitLimit =
    unitsConsumed > 0
      ? Math.min(Math.ceil(unitsConsumed * CU_SAFETY_MULTIPLIER) + CU_FLOOR_OVERHEAD, CU_CEILING)
      : CU_CEILING;

  log("optimized", {
    unitsConsumed,
    computeUnitLimit,
    priorityFee,
    hasErr: !!simulationErr,
  });

  return {
    budgetIxs: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }),
    ],
    simulationErr,
    logs,
    unitsConsumed,
    priorityFee,
    computeUnitLimit,
  };
}

/**
 * Convenience wrapper for callers that don't need to inspect simulation errors —
 * just want budget ixs (priority fee + estimated CU). Always returns ixs; never
 * throws on simulation failure (uses ceiling as fallback).
 */
export async function buildComputeBudgetIxs(params: {
  connection: Connection;
  instructions: TransactionInstruction[];
  payer: PublicKey;
  writableAccounts?: PublicKey[];
  lookupTableAccounts?: AddressLookupTableAccount[];
}): Promise<TransactionInstruction[]> {
  const result = await simulateAndOptimize(params);
  return result.budgetIxs;
}
