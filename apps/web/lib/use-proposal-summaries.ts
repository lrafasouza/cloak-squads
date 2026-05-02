"use client";

import {
  getProposalPdaForIndex,
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
    const proposalIds = new Set<number>();
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey });
    };

    const multisigSubscription = connection.onAccountChange(
      multisigAddress,
      invalidate,
      "confirmed",
    );
    proposalIds.add(multisigSubscription);

    for (const proposal of query.data ?? []) {
      try {
        const index = BigInt(proposal.transactionIndex);
        const proposalPda = getProposalPdaForIndex(multisigAddress, index);
        const subId = connection.onAccountChange(proposalPda, invalidate, "confirmed");
        proposalIds.add(subId);
      } catch {
        // Ignore malformed transaction indices.
      }
    }

    return () => {
      for (const subId of proposalIds) {
        void connection.removeAccountChangeListener(subId).catch(() => undefined);
      }
    };
  }, [connection, multisig, multisigAddress, query.data, queryClient]);

  return { ...query, multisigAddress };
}
