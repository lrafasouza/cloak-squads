"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";

export function useRpcHealth() {
  const { connection } = useConnection();

  return useQuery({
    queryKey: ["rpc-health", connection.rpcEndpoint],
    staleTime: 30_000,
    queryFn: async () => {
      const started = performance.now();
      const slot = await connection.getSlot("confirmed");
      return {
        slot,
        latencyMs: Math.round(performance.now() - started),
      };
    },
  });
}
