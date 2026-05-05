"use client";

import {
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
    // No refetchInterval: real-time updates come via the multisig account subscription below.
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
        void queryClient.refetchQueries({ queryKey, type: "active" });
      }, 300);
    };

    // Subscribe ONLY to the multisig account. Any proposal create / approve / reject /
    // execute mutates the multisig account (transactionIndex, staleTransactionIndex, or
    // member-related fields), so a single subscription is sufficient and avoids N+1
    // WebSocket connections (one per pending proposal).
    const subId = connection.onAccountChange(multisigAddress, invalidate, "confirmed");

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void connection.removeAccountChangeListener(subId).catch(() => undefined);
    };
  }, [connection, multisig, multisigAddress, queryClient]);

  return { ...query, multisigAddress };
}
