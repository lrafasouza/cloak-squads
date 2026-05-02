"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

export type VaultMetadata = {
  id: string;
  cofreAddress: string;
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  emailNotifications: boolean;
  settings?: {
    webhookUrl?: string | null;
    rpcOverride?: string | null;
  } | null;
};

export function vaultMetadataQueryKey(address: string) {
  return ["vault-metadata", address] as const;
}

export function useVaultMetadata(address: string | null) {
  return useQuery({
    queryKey: vaultMetadataQueryKey(address ?? ""),
    enabled: !!address,
    staleTime: 30_000,
    queryFn: async (): Promise<VaultMetadata | null> => {
      if (!address) return null;
      const res = await fetch(`/api/vaults/${encodeURIComponent(address)}`);
      if (!res.ok) return null;
      return res.json();
    },
  });
}

export function useInvalidateVaultMetadata() {
  const queryClient = useQueryClient();
  return (address: string) =>
    queryClient.invalidateQueries({ queryKey: vaultMetadataQueryKey(address) });
}
