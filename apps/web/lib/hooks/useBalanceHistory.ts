"use client";

import { useVaultData } from "@/lib/use-vault-data";
import { useEffect } from "react";

export interface BalanceHistoryPoint {
  timestamp: number;
  balanceLamports: number;
}

function key(multisig: string) {
  return `aegis:balance-history:${multisig}`;
}

function readHistory(multisig: string): BalanceHistoryPoint[] {
  if (typeof window === "undefined" || !multisig) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key(multisig)) ?? "[]") as BalanceHistoryPoint[];
    return parsed.filter((point) => Number.isFinite(point.timestamp));
  } catch {
    return [];
  }
}

export function useBalanceHistory(multisig: string) {
  const { data } = useVaultData(multisig);

  useEffect(() => {
    if (!multisig || !data) return;
    const history = readHistory(multisig);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next = [
      ...history.filter((point) => point.timestamp !== today.getTime()),
      { timestamp: today.getTime(), balanceLamports: data.balanceLamports },
    ].slice(-30);
    localStorage.setItem(key(multisig), JSON.stringify(next));
  }, [multisig, data]);

  return readHistory(multisig);
}
