"use client";

import { type IncomeEntry, useVaultIncome } from "@/lib/hooks/useVaultIncome";
import type { ProposalSummary } from "@/lib/proposals";
import { useProposalSummaries } from "@/lib/use-proposal-summaries";

export type ActivityItem =
  | { kind: "proposal"; timestamp: number; data: ProposalSummary }
  | IncomeEntry;

/**
 * Recent activity feed = executed/rejected/cancelled proposals merged with
 * income deposits, sorted newest first.
 *
 * `internalAddresses` lets the caller hide income rows that originated from
 * a sub-vault or the primary vault — those moves are already represented by
 * their corresponding proposal, so showing both creates a duplicate "Sent
 * 0.2 SOL → Payroll" + "Received 0.2 SOL from <PDA>" pair. Pass `undefined`
 * to keep every income row (legacy behavior for callers without vault data).
 */
export function useRecentActivity(
  multisig: string,
  limit = 10,
  internalAddresses?: ReadonlySet<string>,
) {
  const proposalQuery = useProposalSummaries(multisig);
  const incomeQuery = useVaultIncome(multisig, limit);

  const proposals: ActivityItem[] = (proposalQuery.data ?? [])
    .filter((p) => p.status === "executed" || p.status === "rejected" || p.status === "cancelled")
    .map((p) => ({
      kind: "proposal" as const,
      timestamp: p.createdAt ? new Date(p.createdAt).getTime() : 0,
      data: p,
    }));

  const incomeRaw: IncomeEntry[] = incomeQuery.data ?? [];
  const income: ActivityItem[] = internalAddresses
    ? incomeRaw.filter((i) => !internalAddresses.has(i.from))
    : incomeRaw;

  const activity = [...proposals, ...income]
    .sort((a, b) => {
      const ta = a.kind === "proposal" ? a.timestamp : a.blockTime * 1000;
      const tb = b.kind === "proposal" ? b.timestamp : b.blockTime * 1000;
      return tb - ta;
    })
    .slice(0, limit);

  return {
    activity,
    isLoading: proposalQuery.isLoading || incomeQuery.isLoading,
  };
}
