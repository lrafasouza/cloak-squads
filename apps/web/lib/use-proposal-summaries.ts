"use client";

import {
  getProposalPdaForIndex,
  isProposalPendingStatus,
  loadOnchainProposalSummaries,
  loadPersistedProposalSummaries,
  mergeProposalSummaries,
} from "@/lib/proposals";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

export function proposalSummariesQueryKey(multisig: string) {
  return ["proposal-summaries", multisig] as const;
}

export function useProposalSummaries(multisig: string) {
  const { connection } = useConnection();
  const queryClient = useQueryClient();

  const multisigAddress = useMemo(() => {
    try {
      return multisig ? new PublicKey(multisig) : null;
    } catch {
      return null;
    }
  }, [multisig]);

  const query = useQuery({
    queryKey: proposalSummariesQueryKey(multisig),
    enabled: multisigAddress !== null,
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async () => {
      if (!multisigAddress) return [];

      const [persisted, onchain] = await Promise.all([
        loadPersistedProposalSummaries(multisigAddress),
        loadOnchainProposalSummaries({ connection, multisigAddress }),
      ]);

      return mergeProposalSummaries(persisted, onchain);
    },
  });

  useEffect(() => {
    if (!multisigAddress) return;

    const queryKey = proposalSummariesQueryKey(multisig);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey });
      }, 300);
    };

    const subIds: number[] = [];

    subIds.push(connection.onAccountChange(multisigAddress, invalidate, "confirmed"));

    for (const proposal of query.data ?? []) {
      if (!isProposalPendingStatus(proposal.status)) continue;
      try {
        const index = BigInt(proposal.transactionIndex);
        const proposalPda = getProposalPdaForIndex(multisigAddress, index);
        subIds.push(connection.onAccountChange(proposalPda, invalidate, "confirmed"));
      } catch {
        // Ignore malformed transaction indices.
      }
    }

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      for (const subId of subIds) {
        void connection.removeAccountChangeListener(subId).catch(() => undefined);
      }
    };
  }, [connection, multisig, multisigAddress, query.data, queryClient]);

  return { ...query, multisigAddress };
}
