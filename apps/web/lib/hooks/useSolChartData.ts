"use client";

import { useQuery } from "@tanstack/react-query";

export type ChartPoint = { time: number; value: number };

const CACHE_KEY = "sol-chart-cache";
const CACHE_TTL_MS = 300_000; // 5 minutes

interface CachedData {
  prices: ChartPoint[];
  fetchedAt: number;
}

function readCache(days: number): ChartPoint[] | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}:${days}`);
    if (!raw) return null;
    const parsed: CachedData = JSON.parse(raw);
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.prices;
  } catch {
    return null;
  }
}

function writeCache(days: number, prices: ChartPoint[]) {
  try {
    localStorage.setItem(`${CACHE_KEY}:${days}`, JSON.stringify({ prices, fetchedAt: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function useSolChartData(days = 7) {
  return useQuery({
    queryKey: ["sol-chart", days],
    staleTime: 300_000,
    gcTime: 600_000,
    retry: 1,
    refetchOnWindowFocus: false,
    initialData: () => {
      const cached = readCache(days);
      if (cached && cached.length > 0) {
        return cached;
      }
      return undefined;
    },
    queryFn: async (): Promise<ChartPoint[]> => {
      const res = await fetch(`/api/sol-chart?days=${days}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return readCache(days) ?? [];
      const data = (await res.json()) as { prices: [number, number][] };
      const prices = data.prices.map(([timestamp, price]) => ({
        time: timestamp / 1000,
        value: price,
      }));
      writeCache(days, prices);
      return prices;
    },
  });
}
