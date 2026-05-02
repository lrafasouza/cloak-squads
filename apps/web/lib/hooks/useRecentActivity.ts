"use client";

import type { ProposalSummary } from "@/lib/proposals";
import { useProposalSummaries } from "@/lib/use-proposal-summaries";
import { type IncomeEntry, useVaultIncome } from "@/lib/hooks/useVaultIncome";

export type ActivityItem =
  | { kind: "proposal"; timestamp: number; data: ProposalSummary }
  | IncomeEntry;

export function useRecentActivity(multisig: string, limit = 10) {
  const proposalQuery = useProposalSummaries(multisig);
  const incomeQuery = useVaultIncome(multisig, limit);

  const proposals: ActivityItem[] = (proposalQuery.data ?? [])
    .filter(
      (p) =>
        p.status === "executed" || p.status === "rejected" || p.status === "cancelled",
    )
    .map((p) => ({
      kind: "proposal" as const,
      timestamp: p.createdAt ? new Date(p.createdAt).getTime() : 0,
      data: p,
    }));

  const income: ActivityItem[] = incomeQuery.data ?? [];

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
