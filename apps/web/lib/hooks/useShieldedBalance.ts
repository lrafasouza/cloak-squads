"use client";

import { useQuery } from "@tanstack/react-query";

export function useShieldedBalance(multisig: string) {
  return useQuery({
    queryKey: ["shielded-balance", multisig],
    enabled: !!multisig,
    staleTime: 60_000,
    queryFn: async () => {
      // Cloak on-chain commitment indexing is not yet implemented.
      // Returning zero until a proper indexer is wired up.
      return {
        balanceLamports: 0n,
        balanceSol: "0",
        source: "unavailable" as const,
      };
    },
  });
}
