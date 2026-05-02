"use client";

import { useEffect, useState } from "react";

export type VaultMetadata = {
  name?: string;
};

export function useVaultMetadata(address: string | null) {
  const [data, setData] = useState<VaultMetadata | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/vaults/${encodeURIComponent(address)}`)
      .then((r) => (r.ok ? (r.json() as Promise<VaultMetadata>) : null))
      .then((metadata) => {
        if (!cancelled) setData(metadata);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  return { data, loading };
}
