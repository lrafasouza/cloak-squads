"use client";

import { useVaultData } from "@/lib/use-vault-data";

export type CofreStatus = "loading" | "ready" | "missing" | "error";

export function useCofreStatus(multisig: string) {
  const query = useVaultData(multisig);
  const status: CofreStatus = query.isLoading
    ? "loading"
    : query.error
      ? "error"
      : query.data?.cofreInitialized
        ? "ready"
        : "missing";

  return { ...query, status };
}
