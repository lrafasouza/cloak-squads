"use client";

import { isProposalPendingStatus } from "@/lib/proposals";
import { useProposalSummaries } from "@/lib/use-proposal-summaries";

export function usePendingProposalsCount(multisig: string) {
  const query = useProposalSummaries(multisig);
  const count = (query.data ?? []).filter((proposal) =>
    isProposalPendingStatus(proposal.status),
  ).length;

  return { ...query, count };
}
