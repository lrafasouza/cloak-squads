"use client";

import { useVaultData } from "@/lib/use-vault-data";

export function useVaultBalance(multisig: string) {
  const query = useVaultData(multisig);
  return {
    ...query,
    balanceLamports: query.data?.balanceLamports ?? 0,
    balanceSol: query.data?.balanceSol ?? "0",
  };
}
