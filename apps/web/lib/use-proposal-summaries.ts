"use client";

import {
  loadOnchainProposalSummaries,
  loadPersistedProposalSummaries,
  mergeProposalSummaries,
} from "@/lib/proposals";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export function proposalSummariesQueryKey(multisig: string) {
  return ["proposal-summaries", multisig] as const;
}

export function useProposalSummaries(multisig: string) {
  const { connection } = useConnection();

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
    queryFn: async () => {
      if (!multisigAddress) return [];

      const [persisted, onchain] = await Promise.all([
        loadPersistedProposalSummaries(multisigAddress),
        loadOnchainProposalSummaries({ connection, multisigAddress }),
      ]);

      return mergeProposalSummaries(persisted, onchain);
    },
  });

  return { ...query, multisigAddress };
}
