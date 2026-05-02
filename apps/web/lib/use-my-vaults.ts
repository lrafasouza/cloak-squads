"use client";

import { useCallback, useState } from "react";

export type MyVaultsState = {
  vaults: string[];
  loading: boolean;
  error: string | null;
  search: (ownerBase58: string) => void;
};

export function useMyVaults(): MyVaultsState {
  const [vaults, setVaults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback((ownerBase58: string) => {
    setLoading(true);
    setError(null);
    setVaults([]);

    fetch(`/api/vaults/mine?owner=${ownerBase58}`)
      .then((r) => r.json())
      .then((data: { vaults?: string[]; error?: string }) => {
        if (data.error) {
          setError(data.error);
        } else {
          setVaults(data.vaults ?? []);
        }
      })
      .catch(() => setError("Could not reach the network"))
      .finally(() => setLoading(false));
  }, []);

  return { vaults, loading, error, search };
}
