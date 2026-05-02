"use client";

import { useQuery } from "@tanstack/react-query";

export type IncomeEntry = {
  kind: "income";
  signature: string;
  amountLamports: number;
  from: string;
  blockTime: number;
};

export function useVaultIncome(multisig: string, limit = 10) {
  return useQuery({
    queryKey: ["vault-income", multisig, limit],
    enabled: !!multisig,
    staleTime: 120_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
    queryFn: async (): Promise<IncomeEntry[]> => {
      const res = await fetch(`/api/vaults/${multisig}/income?limit=${limit}`);
      if (!res.ok) return [];
      const data = (await res.json()) as { entries: IncomeEntry[] };
      return data.entries ?? [];
    },
  });
}
