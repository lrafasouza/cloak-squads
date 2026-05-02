"use client";

import { useQuery } from "@tanstack/react-query";

export function useSolPrice() {
  return useQuery({
    queryKey: ["sol-price"],
    staleTime: 60_000,
    gcTime: 300_000,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = await fetch("/api/sol-price", { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const data = (await res.json()) as { price: number | null };
      return data.price;
    },
  });
}
