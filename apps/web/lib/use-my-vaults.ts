"use client";

import { useCallback, useState } from "react";
import { useWalletAuth } from "./use-wallet-auth";

export type AegisVault = {
  id: string;
  cofreAddress: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type MyVaultsState = {
  vaults: AegisVault[];
  loading: boolean;
  error: string | null;
  search: () => void;
};

export function useMyVaults(): MyVaultsState {
  const [vaults, setVaults] = useState<AegisVault[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { fetchWithAuth } = useWalletAuth();

  const search = useCallback(() => {
    setLoading(true);
    setError(null);
    setVaults([]);

    fetchWithAuth("/api/vaults")
      .then((r) => r.json())
      .then((data: { vaults?: AegisVault[]; error?: string }) => {
        if (data.error) {
          setError(data.error);
        } else {
          setVaults(data.vaults ?? []);
        }
      })
      .catch(() => setError("Could not reach the network"))
      .finally(() => setLoading(false));
  }, [fetchWithAuth]);

  return { vaults, loading, error, search };
}
