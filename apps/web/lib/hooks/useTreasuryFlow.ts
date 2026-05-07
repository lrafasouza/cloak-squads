"use client";

import type { ProposalSummary } from "@/lib/proposals";
import {
  type FlowBucket,
  type FlowEvent,
  bucketize,
  computeWindow,
  ratioBigInt,
} from "@/lib/treasury-flow-math";
import { useProposalSummaries } from "@/lib/use-proposal-summaries";
import { useMemo } from "react";
import { type IncomeEntry, useVaultIncome } from "./useVaultIncome";

const LAMPORTS_PER_SOL_BIG = 1_000_000_000n;

export type { FlowBucket } from "@/lib/treasury-flow-math";

export type TreasuryFlow = {
  loading: boolean;
  /** Total inflow lamports in [now-windowDays, now]. */
  inflowLamports: bigint;
  /** Total outflow lamports in the same window. */
  outflowLamports: bigint;
  /** Outflow lamports that went through Cloak (proposals with persisted draft). */
  privateOutflowLamports: bigint;
  /** Outflow that went out as a plain Squads transfer (no Cloak draft). */
  publicOutflowLamports: bigint;
  /** Count of executed private outflows. */
  privateCount: number;
  /** Count of executed public outflows. */
  publicCount: number;
  /** % of outflow value that was shielded (0..1). null when there's no outflow yet. */
  privacyShare: number | null;
  /** Inflow vs the previous equal-length window. null = no comparison data. */
  inflowDelta: number | null;
  /** Outflow vs the previous equal-length window. null = no comparison data. */
  outflowDelta: number | null;
  /** Daily sparkline buckets, oldest → newest, length = windowDays. */
  inflowSpark: FlowBucket[];
  outflowSpark: FlowBucket[];
};

function isExecuted(p: ProposalSummary): boolean {
  return p.status === "executed";
}

function pickAmountLamports(p: ProposalSummary): bigint {
  // Payroll proposals carry totalAmount; single proposals carry amount.
  // Both are stringified base-unit numbers (lamports for SOL flows).
  const raw = p.totalAmount ?? p.amount;
  try {
    if (!raw) return 0n;
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

/**
 * Aggregate inflow and outflow over the last `windowDays`, surface a
 * privacy-share metric, and bucket daily values for sparklines. Reuses
 * `useProposalSummaries` and `useVaultIncome` so we don't issue new requests.
 *
 * Privacy heuristic: a proposal is "private" when `hasDraft === true` — every
 * private flow (private send, payroll, stealth invoice, recurring private)
 * persists a ProposalDraft with the commitmentClaim. Public sends and public
 * recurring runs don't, so this split is reliable client-side without an extra
 * API call.
 */
export function useTreasuryFlow(multisig: string, windowDays = 30): TreasuryFlow {
  const proposalQuery = useProposalSummaries(multisig);
  const incomeQuery = useVaultIncome(multisig, 200);

  return useMemo(() => {
    const proposals = proposalQuery.data ?? [];
    const income: IncomeEntry[] = incomeQuery.data ?? [];

    const now = Date.now();
    const { windowStart, prevStart } = computeWindow(now, windowDays);
    const sparkStart = windowStart;

    let inflow = 0n;
    let prevInflow = 0n;
    const inflowEvents: FlowEvent[] = [];
    for (const inc of income) {
      const ts = inc.blockTime * 1000;
      let lamports: bigint;
      try {
        lamports = BigInt(inc.amountLamports);
      } catch {
        continue;
      }
      if (ts >= windowStart && ts <= now) {
        inflow += lamports;
        inflowEvents.push({ ts, lamports });
      } else if (ts >= prevStart && ts < windowStart) {
        prevInflow += lamports;
      }
    }

    let outflow = 0n;
    let prevOutflow = 0n;
    let privateOutflow = 0n;
    let publicOutflow = 0n;
    let privateCount = 0;
    let publicCount = 0;
    const outflowEvents: FlowEvent[] = [];

    for (const p of proposals) {
      const ts = p.createdAt ? new Date(p.createdAt).getTime() : 0;
      if (!ts) continue;

      if (!isExecuted(p)) continue;
      const lamports = pickAmountLamports(p);
      if (lamports <= 0n) continue;

      if (ts >= windowStart && ts <= now) {
        outflow += lamports;
        outflowEvents.push({ ts, lamports });
        if (p.hasDraft) {
          privateOutflow += lamports;
          privateCount += 1;
        } else {
          publicOutflow += lamports;
          publicCount += 1;
        }
      } else if (ts >= prevStart && ts < windowStart) {
        prevOutflow += lamports;
      }
    }

    // Compute ratios in BigInt-space first to preserve precision past
    // Number.MAX_SAFE_INTEGER, then convert the small scaled result to Number.
    // 1ppm scale gives 6 significant digits which is more than enough for any
    // UI display ("73.4%", "−12% vs prior").
    const inflowDelta = ratioBigInt(inflow - prevInflow, prevInflow);
    const outflowDelta = ratioBigInt(outflow - prevOutflow, prevOutflow);
    const privacyShare = ratioBigInt(privateOutflow, outflow);

    const inflowSpark = bucketize(inflowEvents, sparkStart, windowDays);
    const outflowSpark = bucketize(outflowEvents, sparkStart, windowDays);

    return {
      loading: proposalQuery.isLoading || incomeQuery.isLoading,
      inflowLamports: inflow,
      outflowLamports: outflow,
      privateOutflowLamports: privateOutflow,
      publicOutflowLamports: publicOutflow,
      privateCount,
      publicCount,
      privacyShare,
      inflowDelta,
      outflowDelta,
      inflowSpark,
      outflowSpark,
    };
  }, [
    proposalQuery.data,
    proposalQuery.isLoading,
    incomeQuery.data,
    incomeQuery.isLoading,
    windowDays,
  ]);
}

export function lamportsToSolDisplay(lamports: bigint | number, fractionDigits = 2): string {
  // Convert through bigint→number with explicit lamports/sol division so we
  // don't accumulate float error on integer base units.
  const big = typeof lamports === "bigint" ? lamports : BigInt(Math.trunc(lamports));
  const whole = big / LAMPORTS_PER_SOL_BIG;
  const remainder = big % LAMPORTS_PER_SOL_BIG;
  const decimal = Number(remainder) / Number(LAMPORTS_PER_SOL_BIG);
  const sol = Number(whole) + decimal;
  return sol.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}
