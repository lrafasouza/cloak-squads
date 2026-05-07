"use client";

import type { ProposalSummary } from "@/lib/proposals";
import {
  type FlowBucket,
  aggregateTreasuryFlow,
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
 *
 * `internalAddresses`: base58 addresses owned by this multisig (primary vault
 * PDA + every sub-vault PDA). Treasury KPIs treat external value movement only,
 * so income whose source is one of these addresses (sub-vault → primary,
 * primary → sub-vault, sub → sub) and proposals whose recipient is one of them
 * are excluded from both the current window AND the prior window so deltas
 * stay symmetric. Pass `undefined` (or omit) to fall back to the un-filtered
 * legacy behavior — this keeps server-side pre-renders that don't have the
 * vault data yet from blowing up.
 */
export function useTreasuryFlow(
  multisig: string,
  windowDays = 30,
  internalAddresses?: ReadonlySet<string>,
): TreasuryFlow {
  const proposalQuery = useProposalSummaries(multisig);
  const incomeQuery = useVaultIncome(multisig, 200);

  return useMemo(() => {
    const aggregated = aggregateTreasuryFlow({
      income: (incomeQuery.data ?? []) as IncomeEntry[],
      proposals: (proposalQuery.data ?? []) as ProposalSummary[],
      now: Date.now(),
      windowDays,
      internalAddresses,
    });
    return {
      loading: proposalQuery.isLoading || incomeQuery.isLoading,
      ...aggregated,
    };
  }, [
    proposalQuery.data,
    proposalQuery.isLoading,
    incomeQuery.data,
    incomeQuery.isLoading,
    windowDays,
    internalAddresses,
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
